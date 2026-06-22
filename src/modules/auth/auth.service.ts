import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersRepository } from '../users/users.repository';
import { ForgotPasswordDto, LoginDto, RegisterDto, ResetPasswordDto, VerifyEmailDto } from './dto/auth.dto';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import { MailService } from '../mail/mail.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private usersRepo: UsersRepository,
    private jwtService: JwtService,
    private config: ConfigService,
    @InjectRedis() private readonly redis: Redis,
    private mailService: MailService,
  ) {}

  async register(dto: RegisterDto) {
    const userExists = await this.usersRepo.findByEmail(dto.email);
    if (userExists) throw new BadRequestException('User already exists');

    const hash = await this.hashData(dto.password);

    const newUser = await this.usersRepo.create({
      email: dto.email,
      passwordHash: hash,
      name: dto.name,
    });

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

    if (!user) throw new ForbiddenException('Access Denied');

    const passwordMatches = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatches) throw new ForbiddenException('Access Denied');

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

    if (!user || !user.hashedRt) throw new ForbiddenException('Access Denied');

    const rtMatches = await bcrypt.compare(rt, user.hashedRt);
    if (!rtMatches) throw new ForbiddenException('Access Denied');

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
          expiresIn: (this.config.get<string>('JWT_AT_EXPIRES_IN') || '15m') as any,
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
}
