import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { UsersRepository } from '../users/users.repository';
import { ForgotPasswordDto, LoginDto, RegisterDto, RequestMagicLinkDto, ResetPasswordDto, VerifyEmailDto } from './dto/auth.dto';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../../prisma/prisma.service';
import { BusinessProfileService } from '../business-profile/business-profile.service';
import { CreditService } from '../credit/credit.service';
import { PromoService } from '../promo/promo.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private usersRepo: UsersRepository,
    private jwtService: JwtService,
    private config: ConfigService,
    @InjectRedis() private readonly redis: Redis,
    private mailService: MailService,
    private prisma: PrismaService,
    private businessProfileService: BusinessProfileService,
    private creditService: CreditService,
    private promoService: PromoService,
  ) {}

  /** v1.5 — shared post-creation setup: business profile + credit balance. */
  private async initializeNewUser(userId: string) {
    await this.businessProfileService.resolveActiveProfile(userId);

    try {
      await this.creditService.initializeForUser(userId);
    } catch (err) {
      this.logger.error(`Credit balance init failed for ${userId}: ${(err as any).message}`);
    }
  }

  async register(dto: RegisterDto) {
    const userExists = await this.usersRepo.findByEmail(dto.email);
    if (userExists) throw new BadRequestException('User already exists');

    const hash = await this.hashData(dto.password);

    const newUser = await this.usersRepo.create({
      email: dto.email,
      passwordHash: hash,
      name: dto.name,
      trialEndsAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
    });

    await this.initializeNewUser(newUser.id);

    if (dto.promoCode) {
      await this.promoService.tryApplyAtRegistration(newUser.id, dto.promoCode);
    }

    // Don't let a flaky/misconfigured mail provider fail the whole signup
    try {
      // Send Welcome Email
      await this.mailService.sendWelcomeEmail(newUser.email, newUser.name || 'User');

      // Send Verification Email
      await this.resendVerificationEmail(newUser.email);
    } catch (err) {
      this.logger.error(`Registration email step failed for ${newUser.email}: ${(err as any).message}`);
    }

    const tokens = await this.getTokens(newUser.id, newUser.email);
    await this.updateRtHash(newUser.id, tokens.refresh_token);

    return tokens;
  }

  async login(dto: LoginDto) {
    const user = await this.usersRepo.findByEmail(dto.email);

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const tokens = await this.getTokens(user.id, user.email);
    await this.updateRtHash(user.id, tokens.refresh_token);

    return tokens;
  }

  async oauthLogin(profile: { email?: string; name?: string }) {
    if (!profile.email) {
      throw new BadRequestException('Email not provided by OAuth provider');
    }

    let user = await this.usersRepo.findByEmail(profile.email);

    if (!user) {
      const randomPassword = randomBytes(32).toString('hex');
      const hash = await this.hashData(randomPassword);

      user = await this.usersRepo.create({
        email: profile.email,
        passwordHash: hash,
        name: profile.name,
        isEmailVerified: true,
        trialEndsAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      });

      await this.initializeNewUser(user.id);

      try {
        await this.mailService.sendWelcomeEmail(user.email, user.name || 'User');
      } catch (err) {
        this.logger.error(`OAuth welcome email failed for ${user.email}: ${(err as any).message}`);
      }
    }

    const tokens = await this.getTokens(user.id, user.email);
    await this.updateRtHash(user.id, tokens.refresh_token);

    return tokens;
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.usersRepo.findByEmail(dto.email);
    if (!user) throw new BadRequestException('User not found');

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Store OTP in Redis for 10 minutes
    await this.redis.set(`otp:forgot-password:${dto.email}`, otp, 'EX', 600);

    // Send Email
    await this.mailService.sendMail(
      dto.email,
      'Password Reset OTP',
      `Your OTP for password reset is: <b>${otp}</b>. It will expire in 10 minutes.`,
    );

    return { message: 'OTP sent to your email' };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const savedOtp = await this.redis.get(`otp:forgot-password:${dto.email}`);
    if (!savedOtp || savedOtp !== dto.otp) {
      throw new BadRequestException('Invalid or expired OTP');
    }

    const user = await this.usersRepo.findByEmail(dto.email);
    if (!user) throw new BadRequestException('User not found');

    const hash = await this.hashData(dto.newPassword);
    await this.usersRepo.update(user.id, { passwordHash: hash });


    // Delete OTP from Redis
    await this.redis.del(`otp:forgot-password:${dto.email}`);

    return { message: 'Password reset successful' };
  }

  async resendVerificationEmail(email: string) {
    const user = await this.usersRepo.findByEmail(email);
    if (!user) throw new BadRequestException('User not found');
    if (user.isEmailVerified) throw new BadRequestException('Email already verified');

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Store OTP in Redis for 24 hours
    await this.redis.set(`otp:verify-email:${email}`, otp, 'EX', 86400);

    // Send Email
    await this.mailService.sendMail(
      email,
      'Email Verification OTP',
      `Your OTP for email verification is: <b>${otp}</b>.`,
    );

    return { message: 'Verification OTP sent to your email' };
  }

  async verifyEmail(dto: VerifyEmailDto) {
    const savedOtp = await this.redis.get(`otp:verify-email:${dto.email}`);
    if (!savedOtp || savedOtp !== dto.otp) {
      throw new BadRequestException('Invalid or expired OTP');
    }

    const user = await this.usersRepo.findByEmail(dto.email);
    if (!user) throw new BadRequestException('User not found');

    await this.usersRepo.update(user.id, { isEmailVerified: true });

    // Delete OTP from Redis
    await this.redis.del(`otp:verify-email:${dto.email}`);

    return { message: 'Email verified successfully' };
  }

  async logout(userId: string) {
    // Standard logic: hashedRt null kore deya
    await this.usersRepo.update(userId, { hashedRt: null });
  }

  async refreshTokens(userId: string, rt: string) {
    const user = await this.usersRepo.findById(userId);

    if (!user || !user.hashedRt) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const rtMatches = await bcrypt.compare(rt, user.hashedRt);
    if (!rtMatches) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const tokens = await this.getTokens(user.id, user.email);
    await this.updateRtHash(user.id, tokens.refresh_token);

    return tokens;
  }

  async updateRtHash(userId: string, rt: string) {
    const hash = await this.hashData(rt);
    await this.usersRepo.update(userId, {
      hashedRt: hash,
    });
  }

  hashData(data: string) {
    return bcrypt.hash(data, 10);
  }

  async getTokens(userId: string, email: string) {
    const [at, rt] = await Promise.all([
      this.jwtService.signAsync(
        { sub: userId, email },
        {
          secret: this.config.get<string>('JWT_AT_SECRET'),
          expiresIn: (this.config.get<string>('JWT_AT_EXPIRES_IN')) as any,
        },
      ),
      this.jwtService.signAsync(
        { sub: userId, email },
        {
          secret: this.config.get<string>('JWT_RT_SECRET'),
          expiresIn: (this.config.get<string>('JWT_RT_EXPIRES_IN') || '7d') as any,
        },
      ),
    ]);

    return {
      access_token: at,
      refresh_token: rt,
    };
  }

  // ─────────────────────────────────────────────
  // Magic Link Auth
  // ─────────────────────────────────────────────

  async requestMagicLink(dto: RequestMagicLinkDto) {
    let user = await this.usersRepo.findByEmail(dto.email);
    const isDevMagicUser =
      dto.email === 'test@gmail.com' &&
      this.config.get<string>('NODE_ENV') !== 'production';

    if (!user) {
      const randomPassword = randomBytes(32).toString('hex');
      const hash = await this.hashData(randomPassword);
      user = await this.usersRepo.create({
        email: dto.email,
        passwordHash: hash,
        trialEndsAt: isDevMagicUser ? null : new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      });

      await this.initializeNewUser(user.id);

      if (dto.promoCode) {
        await this.promoService.tryApplyAtRegistration(user.id, dto.promoCode);
      }
    } else if (isDevMagicUser && user.trialEndsAt !== null) {
      await this.usersRepo.update(user.id, { trialEndsAt: null });
    }

    if (isDevMagicUser) {
      const tokens = await this.getTokens(user.id, user.email);
      await this.updateRtHash(user.id, tokens.refresh_token);
      return tokens;
    }

    // Generate secure random token
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Save token to DB
    await this.prisma.magicLinkToken.create({
      data: {
        email: dto.email,
        token,
        expiresAt,
      },
    });

    // Build verification URL
    const frontendUrl = this.config.get<string>('FRONTEND_URL') || 'http://localhost:3000';
    const verifyLink = `${frontendUrl}/auth/verify?token=${token}`;

    // Send email (non-blocking — error is logged but does not crash)
    try {
      await this.mailService.sendMail(
        dto.email,
        'Your PioneerX login link',
        `<p>Click the link below to log in. This link expires in 15 minutes and can only be used once.</p>
<p><a href="${verifyLink}">${verifyLink}</a></p>
<p>If you didn't request this, ignore this email.</p>`,
      );
    } catch (err) {
      this.logger.error(`Magic link email failed for ${dto.email}: ${(err as any).message}`);
    }

    // Always return same message to prevent email enumeration
    return { message: 'Check your email' };
  }

  async verifyMagicLink(token: string) {
    const record = await this.prisma.magicLinkToken.findUnique({
      where: { token },
    });

    if (!record) throw new BadRequestException('Invalid link');
    if (record.used) throw new BadRequestException('Link already used');
    if (record.expiresAt < new Date()) throw new BadRequestException('Link expired');

    // Mark token as used
    await this.prisma.magicLinkToken.update({
      where: { token },
      data: { used: true },
    });

    const user = await this.usersRepo.findByEmail(record.email);
    if (!user) throw new BadRequestException('User not found');

    // Mark email as verified if not already
    if (!user.isEmailVerified) {
      await this.usersRepo.update(user.id, { isEmailVerified: true });
    }

    const tokens = await this.getTokens(user.id, user.email);
    await this.updateRtHash(user.id, tokens.refresh_token);

    return tokens;
  }
}
