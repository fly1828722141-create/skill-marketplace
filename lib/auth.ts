import { NextAuthOptions, getServerSession } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import prisma from '@/lib/prisma';
import { recordEvent } from '@/lib/event-log';

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  session: {
    strategy: 'jwt',
  },
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || 'missing-google-client-id',
      clientSecret:
        process.env.GOOGLE_CLIENT_SECRET || 'missing-google-client-secret',
    }),
  ],
  pages: {
    signIn: '/login',
  },
  callbacks: {
    async signIn({ user, account, profile }) {
      if (!user.email) {
        return false;
      }

      const provider = account?.provider || 'google';
      const providerAccountId =
        account?.providerAccountId ||
        ((profile as { sub?: string } | undefined)?.sub ?? null);

      const dbUser = await prisma.user.upsert({
        where: { email: user.email },
        update: {
          name: user.name || user.email.split('@')[0],
          avatar: user.image || null,
          provider,
          providerAccountId,
          lastLoginAt: new Date(),
        },
        create: {
          name: user.name || user.email.split('@')[0],
          email: user.email,
          avatar: user.image || null,
          provider,
          providerAccountId,
          department: 'External',
          lastLoginAt: new Date(),
        },
      });

      await recordEvent({
        eventName: 'user_sign_in',
        page: '/login',
        module: 'auth',
        action: 'sign_in',
        userId: dbUser.id,
        metadata: {
          provider,
        },
      });

      return true;
    },
    async jwt({ token, user }) {
      const lookupEmail =
        (typeof token.email === 'string' && token.email) || user?.email || null;

      if (!lookupEmail) {
        return token;
      }

      if (user || !token.userId) {
        const dbUser = await prisma.user.findUnique({
          where: { email: lookupEmail },
          select: {
            id: true,
            name: true,
            avatar: true,
          },
        });

        if (dbUser) {
          token.userId = dbUser.id;
          token.name = dbUser.name;
          token.picture = dbUser.avatar;
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = typeof token.userId === 'string' ? token.userId : '';
      }

      return session;
    },
  },
};

export async function getAuthSession() {
  return getServerSession(authOptions);
}

export async function getCurrentUser() {
  const session = await getAuthSession();

  if (!session?.user) {
    return null;
  }

  if (session.user.id) {
    const userById = await prisma.user.findUnique({
      where: { id: session.user.id },
    });
    if (userById) {
      return userById;
    }
  }

  if (!session.user.email) {
    return null;
  }

  return prisma.user.findUnique({
    where: { email: session.user.email },
  });
}
