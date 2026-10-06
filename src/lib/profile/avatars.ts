export const profileAvatars = [
  { id: 'bull', name: 'Bull', character: 'กระทิงใส่เนกไท', meaning: 'ตลาดขาขึ้น / มองบวก' },
  { id: 'bear', name: 'Bear', character: 'หมีใส่ฮู้ด', meaning: 'ตลาดขาลง / สายระวัง' },
  { id: 'cat', name: 'Cat', character: 'แมวถือกราฟ', meaning: 'นักลงทุนมือใหม่ / Curious' },
  { id: 'fox', name: 'Fox', character: 'จิ้งจอกใส่แว่น', meaning: 'วิเคราะห์เก่ง / Strategic' },
  { id: 'turtle', name: 'Turtle', character: 'เต่าถือเหรียญ', meaning: 'Long-term investor' },
  { id: 'squirrel', name: 'Squirrel', character: 'กระรอกสะสมเหรียญ', meaning: 'สายออม / DCA' },
  { id: 'owl', name: 'Owl', character: 'นกฮูกอ่านกราฟ', meaning: 'Fundamental / Research' },
  { id: 'wolf', name: 'Wolf', character: 'หมาป่าเสื้อสูท', meaning: 'Active trader' },
  { id: 'rabbit', name: 'Rabbit', character: 'กระต่ายบนจรวด', meaning: 'Growth / High risk' },
  { id: 'penguin', name: 'Penguin', character: 'เพนกวินถือ briefcase', meaning: 'Balanced investor' },
  { id: 'shark', name: 'Shark', character: 'ฉลามใส่แว่นดำ', meaning: 'Aggressive trader' },
  { id: 'dragon', name: 'Dragon', character: 'มังกรเฝ้าเหรียญ', meaning: 'Achievement / Legendary' },
] as const;

export type ProfileAvatarId = (typeof profileAvatars)[number]['id'];
export type ProfileAvatarType = 'initial' | 'character' | 'upload';

export function isProfileAvatarId(value: unknown): value is ProfileAvatarId {
  return typeof value === 'string' && profileAvatars.some((avatar) => avatar.id === value);
}
