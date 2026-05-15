// Lance via : npx tsx scripts/send-welcome-test.ts
// Envoie les 4 versions du welcome email a nmelikechi@mysoluvia.com
// Subjects prefixes [TEST role=...] pour les distinguer dans la boite.

import 'dotenv/config';
import {
  buildWelcomeAdmin,
  buildWelcomeSuperadmin,
  buildWelcomeCdp,
  buildWelcomeCommercial,
} from '@/lib/email/welcome';
import { sendEmail } from '@/lib/email/_send';

const TEST_EMAIL = 'nmelikechi@mysoluvia.com';
const TEST_PRENOM = 'Nael';

async function main() {
  const versions = [
    {
      role: 'admin' as const,
      built: buildWelcomeAdmin({ prenom: TEST_PRENOM }),
    },
    {
      role: 'superadmin' as const,
      built: buildWelcomeSuperadmin({ prenom: TEST_PRENOM }),
    },
    { role: 'cdp' as const, built: buildWelcomeCdp({ prenom: TEST_PRENOM }) },
    {
      role: 'commercial' as const,
      built: buildWelcomeCommercial({ prenom: TEST_PRENOM }),
    },
  ];

  console.log(`Envoi de ${versions.length} mails de test a ${TEST_EMAIL}...`);
  for (const v of versions) {
    const result = await sendEmail({
      from: 'SOLUVIA <contact@mysoluvia.com>',
      to: TEST_EMAIL,
      subject: `[TEST role=${v.role}] ${v.built.subject}`,
      html: v.built.html,
    });
    if (result.success) {
      console.log(`  OK  role=${v.role}`);
    } else {
      console.error(`  KO  role=${v.role}  error=${result.error}`);
    }
  }
}

main().catch((e) => {
  console.error('Script error:', e);
  process.exit(1);
});
