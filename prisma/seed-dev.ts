import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';
import { randomBytes } from 'crypto';

const dbUrl = process.env.DATABASE_URL!;
const pool = new Pool({ connectionString: dbUrl });
const prisma = new PrismaClient({
  adapter: new PrismaPg(pool),
});

async function main() {
  console.log('🌱 Start dev-only seed for test@gmail.com...');

  const email = 'test@gmail.com';
  const password = randomBytes(20).toString('hex');
  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      passwordHash,
      trialEndsAt: null,
      updatedAt: new Date(),
    },
    create: {
      email,
      passwordHash,
      trialEndsAt: null,
    },
  });

  const jwtAtSecret = process.env.JWT_AT_SECRET!;
  const jwtRtSecret = process.env.JWT_RT_SECRET!;
  const jwtAtExpiresIn = process.env.JWT_AT_EXPIRES_IN || '15m';
  const jwtRtExpiresIn = process.env.JWT_RT_EXPIRES_IN || '7d';

  const accessToken = jwt.sign(
    { sub: user.id, email },
    jwtAtSecret as jwt.Secret,
    { expiresIn: jwtAtExpiresIn } as jwt.SignOptions,
  );

  const refreshToken = jwt.sign(
    { sub: user.id, email },
    jwtRtSecret as jwt.Secret,
    { expiresIn: jwtRtExpiresIn } as jwt.SignOptions,
  );

  const hashedRt = await bcrypt.hash(refreshToken, 10);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      hashedRt,
    },
  });

  console.log('✅ Dev user seeded: test@gmail.com');
  console.log('   access_token:', accessToken);
  console.log('   refresh_token:', refreshToken);
  console.log('   Note: this user has no trial expiry and can use the refresh flow normally.');
}

main()
  .catch((error) => {
    console.error('❌ Dev seed error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
