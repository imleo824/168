import bcrypt from 'bcrypt';
import prisma from '../db';

export async function authenticatePasswordAccount(options: {
  loginAccount: string;
  password: string;
}) {
  const { loginAccount, password } = options;

  const user = await prisma.user.findFirst({
    where: {
      loginAccount: {
        equals: loginAccount,
        mode: 'insensitive',
      },
    },
  });

  if (!user || !user.passwordHash) {
    throw Object.assign(new Error('账号或密码不正确，请重新输入'), { statusCode: 401 });
  }
  if (user.isDisabled) {
    throw Object.assign(new Error('账号已被限制，暂时无法使用'), { statusCode: 403 });
  }

  const isMatch = await bcrypt.compare(password, user.passwordHash);
  if (!isMatch) {
    throw Object.assign(new Error('账号或密码不正确，请重新输入'), { statusCode: 401 });
  }

  return user;
}
