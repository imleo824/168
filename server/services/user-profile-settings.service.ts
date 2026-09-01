import bcrypt from 'bcrypt';
import prisma, { isDbConfigured } from '../db';

export async function updateUserBio(userId: string, bio: string) {
  if (!isDbConfigured()) return;

  await prisma.user.update({
    where: { id: userId },
    data: { bio: bio || null },
  });
}

export async function updateUserLoginAccount(userId: string, loginAccount: string) {
  if (!isDbConfigured()) return;

  try {
    const existing = await prisma.user.findFirst({
      where: {
        loginAccount: {
          equals: loginAccount,
          mode: 'insensitive',
        },
      },
    });
    if (existing && existing.id !== userId) {
      throw Object.assign(new Error('该登录账号已被占用，请使用其他名称'), { statusCode: 400 });
    }

    await prisma.user.update({
      where: { id: userId },
      data: { loginAccount },
    });
  } catch (error: any) {
    if (error?.code === 'P2002') {
      throw Object.assign(new Error('该登录账号已被占用，请使用其他名称'), { statusCode: 409 });
    }
    throw error;
  }
}

export async function updateUserPassword(options: {
  userId: string;
  password: string;
  oldPassword: string;
  validateLoginPassword: (password: string, username?: string) => string | null | undefined;
}) {
  if (!isDbConfigured()) return;

  const { userId, password, oldPassword, validateLoginPassword } = options;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw Object.assign(new Error('User not found'), { statusCode: 404 });

  const hasExistingPassword = Boolean(user?.passwordHash);
  const passwordError = validateLoginPassword(password, user.loginAccount || user.displayName);
  if (passwordError) throw Object.assign(new Error(passwordError), { statusCode: 400 });

  if (hasExistingPassword) {
    if (!oldPassword) {
      throw Object.assign(new Error('请输入原始密码进行确认'), { statusCode: 400 });
    }
    const isMatch = await bcrypt.compare(oldPassword, user.passwordHash);
    if (!isMatch) {
      throw Object.assign(new Error('原始密码输入错误'), { statusCode: 400 });
    }

    if (password === oldPassword) {
      throw Object.assign(new Error('新密码不能和原密码相同'), { statusCode: 400 });
    }
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash },
  });
}

export async function updateUserPaymentPassword(options: {
  userId: string;
  password: string;
  oldPassword: string;
}) {
  if (!isDbConfigured()) return;

  const { userId, password, oldPassword } = options;
  const user = await (prisma as any).user.findUnique({
    where: { id: userId },
    select: { paymentPasswordHash: true },
  });
  if (!user) throw Object.assign(new Error('User not found'), { statusCode: 404 });

  const hasExistingPaymentPassword = Boolean(user?.paymentPasswordHash);
  if (hasExistingPaymentPassword) {
    if (!oldPassword) {
      throw Object.assign(new Error('请输入原支付密码进行确认'), { statusCode: 400 });
    }
    const isMatch = await bcrypt.compare(oldPassword, user.paymentPasswordHash);
    if (!isMatch) {
      throw Object.assign(new Error('原支付密码输入错误'), { statusCode: 400 });
    }
    if (password === oldPassword) {
      throw Object.assign(new Error('新支付密码不能和原支付密码相同'), { statusCode: 400 });
    }
  }

  const paymentPasswordHash = await bcrypt.hash(password, 10);
  await (prisma as any).user.update({
    where: { id: userId },
    data: { paymentPasswordHash },
  });
}
