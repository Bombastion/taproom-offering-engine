import readline from 'node:readline';
import { parseResetArgs, resetPassword, ResetPasswordError } from '../auth/resetPassword';

/*
Sets a new password for an account. Run it where the server runs:

    docker compose exec taproom-offering-engine npm run user:reset-password -- someone@example.com

It asks for the new password twice without showing it. To script it, pipe the password in with
--password-stdin. See auth/resetPassword.ts for what it does.
*/

const USAGE = 'Usage: npm run user:reset-password -- <email> [--password-stdin]';

// Asks a question without echoing what's typed
function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    let muted = false;
    // readline echoes through this; the question goes out first, then the typing is muted
    (rl as unknown as { _writeToOutput: (text: string) => void })._writeToOutput = (text) => {
      if (!muted) process.stdout.write(text);
    };
    rl.question(question, (answer) => {
      process.stdout.write('\n');
      rl.close();
      resolve(answer);
    });
    muted = true;
  });
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  // Drop the newline that `echo` or a file adds, but nothing else: spaces can be part of a password
  return Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/, '');
}

async function main(): Promise<number> {
  const args = parseResetArgs(process.argv.slice(2));
  if ('error' in args) {
    console.error(`${args.error}\n${USAGE}`);
    return 2;
  }

  let password: string;
  if (args.passwordFromStdin) {
    password = await readStdin();
  } else {
    if (!process.stdin.isTTY) {
      console.error('Not a terminal, so the password cannot be asked for. Use --password-stdin, or run this with an interactive terminal (docker compose exec without -T).');
      return 2;
    }
    password = await askHidden('New password: ');
    if (password !== (await askHidden('Again: '))) {
      console.error("The two passwords don't match. Nothing was changed.");
      return 1;
    }
  }

  // Loaded only now, so a mistyped command or password fails straight away rather than after
  // connecting to the database
  const { prisma } = await import('../prisma/client');
  const { PrismaDataProvider } = await import('../storage/providers');
  const dataProvider = new PrismaDataProvider(prisma);
  try {
    const user = await resetPassword(dataProvider, args.email, password);
    console.log(`Changed the password for ${user.email} and signed it out everywhere.`);
    if (user.status !== 'ACTIVE') {
      console.log(`Note: this account is ${user.status.toLowerCase()}, so it still can't sign in.`);
    }
    return 0;
  } catch (e) {
    if (e instanceof ResetPasswordError) {
      console.error(e.message);
      return 1;
    }
    throw e;
  } finally {
    await prisma.$disconnect();
  }
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
