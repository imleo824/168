import bcrypt from 'bcryptjs';
import prisma from '../db';
import { TransactionAction } from '../../shared/domain';
import {
  bindReferralRelationOnRegistration,
} from './referral.service';
import { normalizeReferralInviteCode } from '../../shared/referral';

export async function registerPasswordAccount(options: {
  loginAccount: string;
  password: string;
  signupRewardPoints: unknown;
  inviteCode?: unknown;
  inviteSource?: 'link' | 'manual';
  sourceIp?: string;
  sourceUserAgent?: string;
}) {
  const { loginAccount, password, signupRewardPoints } = options;
  const inviteCode = normalizeReferralInviteCode(options.inviteCode);

  try {
    const existing = await prisma.user.findFirst({
      where: {
        loginAccount: {
          equals: loginAccount,
          mode: 'insensitive',
        },
      },
    });

    if (existing) {
      throw Object.assign(new Error('这个账号已被使用，请换一个'), { statusCode: 400 });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    return prisma.$transaction(async (tx) => {
      const configuredReward = Number(signupRewardPoints);
      const initialPoints = Number.isFinite(configuredReward) ? Math.max(0, Math.floor(configuredReward)) : 0;

      const createdUser = await tx.user.create({
        data: {
          loginAccount,
          passwordHash,
          displayName: loginAccount,
          photoUrl: null,
          contact: null,
          role: 'USER',
          points: initialPoints,
        },
      });

      if (inviteCode) {
        await bindReferralRelationOnRegistration(tx, {
          inviteeId: createdUser.id,
          inviteCode,
          source: options.inviteSource || 'manual',
          sourceIp: options.sourceIp,
          sourceUserAgent: options.sourceUserAgent,
        });
      }

      if (initialPoints > 0) {
        await tx.pointTransaction.create({
          data: {
            userId: createdUser.id,
            amount: initialPoints,
            action: TransactionAction.SIGNUP_REWARD as any,
            description: '注册成功赠送积分',
          },
        });
      }

      return createdUser;
    });
  } catch (error: any) {
    if (error?.code === 'P2002') {
      throw Object.assign(new Error('这个账号已被使用，请换一个'), { statusCode: 400 });
    }
    throw error;
  }
}
