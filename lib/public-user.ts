import prisma from '@/lib/prisma';

const DEFAULT_PUBLIC_USER_NAME = 'fly';
const DEFAULT_PUBLIC_USER_EMAIL = 'fly@skill-marketplace.local';
const DEFAULT_PUBLIC_USER_DEPARTMENT = 'Community';

export async function getPublicUser() {
  const email = process.env.PUBLIC_USER_EMAIL || DEFAULT_PUBLIC_USER_EMAIL;
  const name = process.env.PUBLIC_USER_NAME || DEFAULT_PUBLIC_USER_NAME;
  const department =
    process.env.PUBLIC_USER_DEPARTMENT || DEFAULT_PUBLIC_USER_DEPARTMENT;

  return prisma.user.upsert({
    where: { email },
    update: { name, department },
    create: {
      name,
      email,
      department,
    },
  });
}
