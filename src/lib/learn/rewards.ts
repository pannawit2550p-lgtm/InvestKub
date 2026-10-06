import { REWARD_PER_LESSON } from '@/content/lesson-settings';
import { thbToUsd } from '@/lib/currency';
import { createAdminClient } from '@/lib/supabase/admin';

export async function claimLessonReward(userId: string, lessonId: string) {
  const rewardAccountAmount = Math.round(thbToUsd(REWARD_PER_LESSON) * 100) / 100;
  const { data, error } = await createAdminClient().rpc('claim_lesson_reward', {
    p_user_id: userId,
    p_lesson_id: lessonId,
    p_reward_amount: rewardAccountAmount,
  });
  if (error) throw new Error(error.message.includes('LESSON_NOT_PASSED') ? 'LESSON_NOT_PASSED' : 'REWARD_CLAIM_FAILED');
  return data as { paid: boolean; already_claimed: boolean; reward_amount: number; cash_balance: number; reward_balance: number; reward_claimed_at?: string };
}
