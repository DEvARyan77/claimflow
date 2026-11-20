/**
 * Demo-site "brain" for the Policy Assistant.
 * The real app sends the best-matching clauses to Gemini. The free demo site has no server, so it uses:
 *  - prepared answers for common questions, written from the sample policy and citing its clauses
 *  - the same compliance rules a reviewer would apply, for "Check compliance"
 *  - plain keyword search over the clauses for anything else
 */

/** Splits policy text into numbered clauses ("5.1 Cataract surgery…") with their page numbers. */
export function parseClauses(text) {
  const clauses = [];
  let page = 1;
  let current = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const pageMark = line.match(/^=+\s*Page\s+(\d+)\s*=+$/i);
    if (pageMark) {
      page = Number(pageMark[1]);
      continue;
    }
    if (!line) continue;
    const numbered = line.match(/^(\d{1,2}\.\d{1,2})\s+(.*)$/);
    if (numbered) {
      current = { id: numbered[1], page, text: line };
      clauses.push(current);
    } else if (/^Annexure A/i.test(line)) {
      current = { id: 'A', page, text: line };
      clauses.push(current);
    } else if (/^Section \d+/i.test(line)) {
      current = null; // headings aren't clauses
    } else if (current) {
      current.text += ` ${line}`;
    }
  }
  return clauses;
}

/** For uploaded documents without numbered clauses: ~70-word chunks per page. */
export function chunkPages(pages) {
  const clauses = [];
  pages.forEach((pageText, i) => {
    const words = pageText.split(/\s+/).filter(Boolean);
    for (let start = 0; start < words.length; start += 70) {
      clauses.push({ id: `p${i + 1}-${start}`, page: i + 1, text: words.slice(start, start + 70).join(' ') });
    }
  });
  return clauses;
}

const TOPICS = [
  {
    id: 'cataract',
    keywords: ['cataract', 'eye surgery', 'lens'],
    clauses: ['5.1', '6.2', '2.2'],
    answer:
      'Yes, **cataract surgery is covered**, with two conditions:\n- It is paid up to **Rs. 40,000 per eye**, even if your Sum Insured is higher [1].\n- It is covered only after **24 months** of continuous cover, because cataract is on the specific-illness waiting list [2].\n\nIt counts as a Day Care Procedure, so you don’t need to stay 24 hours in hospital [3].',
  },
  {
    id: 'I21',
    keywords: ['heart attack', 'heart', 'cardiac', 'i21', 'angioplasty', 'stroke'],
    clauses: ['3.1', '2.4', '9.2', '6.1', '4.1', '4.2'],
    answer:
      'Yes, **heart attack treatment is covered** as in-patient hospitalisation: room, ICU, doctor fees, medicines and tests [1].\n- A heart attack counts as an **Emergency** [2], so inform ClaimFlow **within 24 hours** of admission [3].\n- No illness claim is payable in the **first 30 days** of a new policy [4].\n- Room rent is paid up to **1% of the Sum Insured per day**, and ICU up to **2% per day** [5][6].\n\nThere is no special sub-limit for heart treatment.',
  },
  {
    id: 'J18',
    keywords: ['pneumonia', 'j18', 'lung', 'chest infection'],
    clauses: ['3.1', '2.1', '6.1', '3.2', '3.3', '4.1'],
    answer:
      'Yes, **pneumonia is covered** when you are admitted for at least 24 hours for active treatment [1][2].\n- No illness claim is payable in the **first 30 days** of a new policy [3].\n- Costs up to **30 days before** and **60 days after** the hospital stay are also covered [4][5].\n- Room rent is paid up to **1% of the Sum Insured per day** [6].',
  },
  {
    id: 'S72',
    keywords: ['fracture', 'thigh', 's72', 'accident', 'injury', 'broken'],
    clauses: ['3.1', '6.1', '8.3', '5.2', '6.2', '3.5'],
    answer:
      'Yes, **fracture treatment after an accident is covered** as hospitalisation [1].\n- Accidents skip the **30-day initial waiting period** [2] and have **no co-payment** [3].\n- If the fracture needs a **hip or knee joint replacement**, that part is paid up to **Rs. 1,50,000 per joint** [4] and is on the 24-month waiting list [5].\n- Road ambulance is covered up to **Rs. 2,000** [6].',
  },
  {
    id: 'K35',
    keywords: ['appendicitis', 'appendix', 'k35', 'appendectomy'],
    clauses: ['3.1', '6.1', '4.1', '4.3'],
    answer:
      'Yes, **appendicitis surgery is covered** as in-patient hospitalisation, including surgeon fees, operation theatre and medicines [1].\n- There is **no special sub-limit** or long waiting period; only the **30-day initial waiting period** of a new policy applies [2].\n- Choose a room within **1% of the Sum Insured per day**, or other charges are cut in proportion [3][4].',
  },
  {
    id: 'A90',
    keywords: ['dengue', 'a90', 'malaria', 'typhoid', 'viral fever'],
    clauses: ['3.1', '2.1', '7.10', '6.1', '3.2', '3.3'],
    answer:
      'Yes, **dengue is covered** if you are admitted for at least 24 hours for active treatment [1][2].\n- Admission **only for tests or observation** is not covered [3].\n- No illness claim is payable in the **first 30 days** of a new policy [4].\n- Tests and medicines up to **30 days before** and **60 days after** the stay are covered too [5][6].',
  },
  {
    id: 'N20',
    keywords: ['kidney stone', 'kidney', 'stone', 'n20', 'lithotripsy', 'gall bladder', 'gallbladder'],
    clauses: ['5.4', '6.2', '2.2'],
    answer:
      '**Partly.** Kidney stone treatment is covered, with limits:\n- It is paid up to **Rs. 50,000** per policy year, including lithotripsy [1].\n- It is covered only after **24 months** of continuous cover [2].\n- Lithotripsy is a **Day Care Procedure**, so a 24-hour stay isn’t needed [3].',
  },
  {
    id: 'E11',
    keywords: ['diabetes', 'e11', 'sugar', 'hypertension', 'blood pressure', 'insulin'],
    clauses: ['2.3', '6.3', '7.10'],
    answer:
      '**Partly.** Diabetes is usually a **Pre-existing Disease** [1]:\n- If you declared it in the proposal form, it is covered after **12 months** of continuous cover. Other pre-existing diseases wait **36 months** [2].\n- You must be admitted for **active treatment**; admission only for tests or observation is not covered [3].',
  },
  {
    id: 'joint',
    keywords: ['knee', 'joint replacement', 'hip replacement'],
    clauses: ['5.2', '6.2'],
    answer: '**Partly.** Knee or hip **joint replacement** is paid up to **Rs. 1,50,000 per joint** [1], and only after **24 months** of continuous cover [2].',
  },
  {
    id: 'hernia',
    keywords: ['hernia', 'piles', 'hydrocele'],
    clauses: ['5.3', '6.2'],
    answer: 'Hernia, hydrocele and piles surgery is paid up to **Rs. 60,000** per policy year [1], and only after **24 months** of continuous cover [2].',
  },
  {
    id: 'waiting',
    generic: true,
    keywords: ['waiting period', 'waiting', 'wait', 'pre-existing', 'pre existing', 'how long'],
    clauses: ['6.1', '6.2', '6.3', '6.4', '6.5'],
    answer:
      'The policy has **four waiting periods**:\n- **30 days** from the start for any illness; accidents are covered from day one [1].\n- **24 months** for specific illnesses such as cataract, hernia, kidney stones and joint replacement [2].\n- **36 months** for declared pre-existing diseases, and **12 months** for declared diabetes and hypertension [3].\n- **24 months** for maternity [4].\n\nThey count from your first policy start date and continue across renewals [5].',
  },
  {
    id: 'room',
    keywords: ['room rent', 'room', 'icu', 'ward', 'private room', 'bed'],
    clauses: ['4.1', '4.2', '4.3'],
    answer:
      'Room rent is paid up to **1% of the Sum Insured per day**, and ICU up to **2% per day** [1][2].\n- If you pick a costlier room, **all related charges** (except medicines and implants) are paid in the same proportion [3].\n- Example: the allowed rent is Rs. 5,000/day but the room costs Rs. 10,000/day, so only **50%** of related charges are paid [3].',
  },
  {
    id: 'exclusions',
    keywords: ['not covered', 'exclusion', 'excluded', 'exclude', "doesn't cover", 'what is not', 'not pay for'],
    clauses: ['7.1', '7.2', '7.3', '7.5', '7.6', '7.8', '7.11', '7.10', '7.12'],
    answer:
      'The main things **not covered** are:\n- Cosmetic surgery (unless after an accident, burns or cancer) and dental treatment (unless after an accident) [1][2].\n- Spectacles, hearing aids and walking aids [3].\n- Infertility treatment and IVF [4], and injuries from alcohol or drug abuse [5].\n- Adventure sports injuries [6] and treatment outside India [7].\n- Admission **only for tests or observation** [8], and non-medical items like toiletries [9].',
  },
  {
    id: 'copay',
    generic: true,
    keywords: ['co-payment', 'copayment', 'co payment', 'pay anything', 'pay myself', 'out of pocket', 'own pocket', 'how much will i pay'],
    clauses: ['1.4', '8.1', '8.2', '4.3', '7.12', '8.3'],
    answer:
      'Usually **nothing**: ClaimFlow pays the Network Hospital directly (cashless) [1]. You may pay a share when:\n- you are **61 or older** at the start of the policy year: **10% co-payment** [2]\n- you choose a hospital in a **higher city zone** than your policy: **15% co-payment** [3]\n- your room costs more than the room rent limit [4]\n- there are non-medical items such as toiletries or attendant food [5]\n\nAccident claims have **no co-payment** [6].',
  },
  {
    id: 'claim',
    keywords: ['cashless', 'how do i make', 'how to claim', 'make a claim', 'claim process', 'documents', 'reimburse'],
    clauses: ['9.1', '9.2', '9.4', '9.5'],
    answer:
      '**Cashless claims:** show your ClaimFlow health card at the Network Hospital’s insurance desk. The hospital sends the request, and approval usually comes within minutes [1].\n- Tell ClaimFlow **48 hours before** a planned admission, or **within 24 hours** of an emergency admission [2].\n- Keep the discharge summary, final bill, prescriptions and reports [3].\n- Claims are settled or rejected within **30 days** of the last document, with the reason in writing [4].',
  },
  {
    id: 'network',
    keywords: ['network', 'non-network', 'which hospital', 'any hospital'],
    clauses: ['1.3', '2.4', '1.4'],
    answer:
      'Claims are paid only for treatment at a **Network Hospital**, one that has a cashless agreement with ClaimFlow [1].\n- Treatment **outside the network** is not payable, except in an **Emergency** such as a heart attack, stroke or major accident [1][2].\n- ClaimFlow pays the Network Hospital directly [3].',
  },
  {
    id: 'maternity',
    keywords: ['maternity', 'pregnan', 'delivery', 'childbirth', 'caesarean'],
    clauses: ['3.7', '6.4'],
    answer:
      'Yes, **childbirth is covered** up to **Rs. 50,000 per delivery**, normal or caesarean [1].\n- Only after **24 months** of continuous cover [2].\n- Pre- and post-natal costs are covered only if you are hospitalised [1].',
  },
  {
    id: 'ambulance',
    keywords: ['ambulance'],
    clauses: ['3.5'],
    answer: 'Road ambulance is covered up to **Rs. 2,000 per hospitalisation**, to the nearest Network Hospital [1].',
  },
  {
    id: 'ayush',
    keywords: ['ayush', 'ayurveda', 'homeopathy', 'unani', 'siddha', 'yoga'],
    clauses: ['3.8'],
    answer: 'Yes. In-patient AYUSH treatment at a government-recognised hospital is covered up to **Rs. 25,000 per policy year** [1].',
  },
  {
    id: 'dental',
    keywords: ['dental', 'teeth', 'tooth'],
    clauses: ['7.2'],
    answer: '**Not covered**, unless the dental treatment needs hospitalisation because of an **accident** [1].',
  },
  {
    id: 'cosmetic',
    keywords: ['cosmetic', 'plastic surgery'],
    clauses: ['7.1'],
    answer: '**Not covered**, unless it is needed because of an **accident, burns or cancer** [1].',
  },
  {
    id: 'abroad',
    keywords: ['outside india', 'abroad', 'foreign', 'overseas'],
    clauses: ['7.11'],
    answer: '**Not covered.** Treatment taken outside India is excluded [1].',
  },
  {
    id: 'prepost',
    keywords: ['pre-hospitalisation', 'post-hospitalisation', 'before admission', 'after discharge', 'follow-up', 'follow up'],
    clauses: ['3.2', '3.3', '9.3'],
    answer:
      'Yes: medical costs up to **30 days before** admission and **60 days after** discharge, for the same illness, are covered [1][2]. Submit post-hospitalisation bills within **30 days** of finishing treatment [3].',
  },
  {
    id: 'sum',
    keywords: ['sum insured', 'cover limit', 'coverage limit', 'how much cover', 'reset', 'renew'],
    clauses: ['2.5', '1.2', '10.1'],
    answer:
      'The **Sum Insured** is the most ClaimFlow pays in one policy year for all claims together [1]. It is available once per policy year and **resets at renewal** [2]. The policy is renewable for life [3].',
  },
];

const STOP = new Set(
  'a an and are as at be by can do does for from have how i if in is it its me my of on or the this to was what when which will with you your there any about policy covered cover my claim question'.split(' '),
);

function scoreTopic(topic, q) {
  return topic.keywords.reduce((sum, k) => (q.includes(k) ? sum + k.length : sum), 0);
}

function sourcesFor(ids, clauses, doc) {
  return ids.map((id, i) => {
    const clause = clauses.find((c) => c.id === id);
    return {
      number: i + 1,
      documentId: doc.id,
      documentTitle: doc.title,
      page: clause?.page ?? 1,
      excerpt: clause?.text ?? `Clause ${id}`,
      score: 1,
    };
  });
}

function search(question, clauses, doc) {
  const words = question
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
  const scored = clauses
    .map((c) => {
      const text = c.text.toLowerCase();
      return { c, score: words.reduce((s, w) => (text.includes(w) ? s + 1 : s), 0) };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  return scored.map(({ c, score }, i) => ({
    number: i + 1,
    documentId: doc.id,
    documentTitle: doc.title,
    page: c.page,
    excerpt: c.text,
    score: Math.min(1, score / Math.max(1, words.length)),
  }));
}

/** Pulls "ICD-10 I21" out of the claim summary the chat sends ("My claim: treatment for …"). */
function diagnosisFromContext(text) {
  const m = text.match(/ICD-10\s+([A-Z]\d{2})/i);
  return m ? m[1].toUpperCase() : null;
}

export function answerQuestion(fullQuestion, doc, clauses) {
  const parts = fullQuestion.split(/\nQuestion:\s*/);
  const question = (parts.length > 1 ? parts[1] : fullQuestion).toLowerCase();
  const diagnosis = parts.length > 1 ? diagnosisFromContext(parts[0]) : null;
  const knowsSample = clauses.some((c) => c.id === '5.1') && clauses.some((c) => c.id === '6.2');

  if (knowsSample) {
    let best = null;
    let bestScore = 0;
    for (const topic of TOPICS) {
      const s = scoreTopic(topic, question);
      if (s > bestScore) {
        best = topic;
        bestScore = s;
      }
    }
    // "Is this covered?" / "waiting period for this?" while filling a claim → answer for that treatment
    const vague = !best || best.id === 'waiting' || /\b(this|my treatment|it)\b/.test(question);
    if (diagnosis && vague && best?.id !== 'copay' && best?.id !== 'room') {
      best = TOPICS.find((t) => t.id === diagnosis) ?? best;
    }
    if (best) {
      return { answer: best.answer, mode: 'demo', note: null, sources: sourcesFor(best.clauses, clauses, doc) };
    }
  }

  const sources = search(question, clauses, doc);
  if (sources.length === 0) {
    return {
      answer: `I couldn't find anything about this in ${doc.title}.`,
      mode: 'search',
      note: null,
      sources: [],
    };
  }
  return {
    answer: 'Here are the parts of your policy that best match your question. See the highlighted pages below.',
    mode: 'search',
    note: knowsSample
      ? 'This free demo has written answers for common questions. For this one, here are the closest clauses. The full app writes the answer with Gemini.'
      : 'On this free demo, your own policy is searched by keywords. The full app writes the answer with Gemini.',
    sources,
  };
}

const rupees = (n) => `Rs. ${Math.round(Number(n)).toLocaleString('en-IN')}`;

/** "Check compliance" for a claim, using the sample policy's rules. */
export function precheck({ diagnosisCode, diagnosisLabel, amount, hospitalName, inNetwork }, doc, clauses) {
  const label = diagnosisLabel || diagnosisCode;
  const bill = `- Your bill of **${rupees(amount)}** is also checked against your remaining cover when you submit.`;
  const make = (text, ids) => ({ answer: text, mode: 'demo', note: null, sources: sourcesFor(ids, clauses, doc) });

  if (inNetwork === false) {
    const emergency = diagnosisCode === 'I21';
    return make(
      `NOT COVERED\n\n**${hospitalName} is outside the ClaimFlow network**, and claims there are not payable [1].` +
        (emergency
          ? '\n- The policy makes an exception for an **Emergency** such as a heart attack [2], but this app only approves network hospitals, so choose one from the list.'
          : '\n- Choose a Network Hospital to get the bill paid directly [2].'),
      emergency ? ['1.3', '2.4'] : ['1.3', '1.4'],
    );
  }

  switch (diagnosisCode) {
    case 'N20': {
      const over = Number(amount) - 50000;
      return make(
        `PARTLY COVERED\n\nKidney stone treatment has a sub-limit and a waiting period:\n- It is paid up to **Rs. 50,000** per policy year [1]. ${
          over > 0 ? `Your bill is **${rupees(over)} above** that, so that part won't be paid.` : 'Your bill is within this limit.'
        }\n- It is covered only after **24 months** of continuous cover [2].\n- Lithotripsy is a Day Care Procedure, so no 24-hour stay is needed [3].`,
        ['5.4', '6.2', '2.2'],
      );
    }
    case 'E11':
      return make(
        `PARTLY COVERED\n\nDiabetes is usually a **Pre-existing Disease** [1]:\n- It is covered after **12 months** of continuous cover if you declared it [2].\n- You must be admitted for **active treatment**; tests or observation alone are not covered [3].\n${bill}`,
        ['2.3', '6.3', '7.10'],
      );
    case 'S72':
      return make(
        `LIKELY COVERED\n\n${label} after an accident is covered as hospitalisation [1].\n- Accidents skip the **30-day initial waiting period** [2] and have **no co-payment** [3].\n- If a **hip joint replacement** is needed, that part is paid up to **Rs. 1,50,000** [4].\n${bill}`,
        ['3.1', '6.1', '8.3', '5.2'],
      );
    case 'I21':
      return make(
        `LIKELY COVERED\n\nA heart attack is an **Emergency** and is covered as hospitalisation [1][2].\n- Inform ClaimFlow **within 24 hours** of admission [3].\n- The **30-day initial waiting period** applies to a new policy [4].\n- Room rent up to **1%** and ICU up to **2%** of the Sum Insured per day [5][6].\n${bill}`,
        ['3.1', '2.4', '9.2', '6.1', '4.1', '4.2'],
      );
    case 'A90':
      return make(
        `LIKELY COVERED\n\nDengue is covered when you are admitted for at least **24 hours** for active treatment [1][2].\n- Admission only for tests or observation is **not covered** [3].\n- The **30-day initial waiting period** applies to a new policy [4].\n${bill}`,
        ['3.1', '2.1', '7.10', '6.1'],
      );
    default:
      return make(
        `LIKELY COVERED\n\n${label} is covered as in-patient hospitalisation [1].\n- The **30-day initial waiting period** applies to a new policy [2].\n- Room rent is paid up to **1% of the Sum Insured per day**; a costlier room reduces related charges in proportion [3][4].\n${bill}`,
        ['3.1', '6.1', '4.1', '4.3'],
      );
  }
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const PHONE = /(?:\+91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}/;
const POLICY_NUMBER = /policy\s*(?:no\.?|number|#)\s*[:-]?\s*([A-Z0-9][A-Z0-9/-]{3,})/i;
const SUM_INSURED = /sum\s*insured\s*[:-]?\s*(?:rs\.?|inr|₹)?\s*([\d,]+(?:\.\d+)?\s*(?:lakhs?|lacs?|crores?)?)/i;
const NAME =
  /(?:name\s+of\s+(?:the\s+)?insured|insured\s+(?:person|name)|policy\s*holder(?:'s)?\s*(?:name)?|proposer(?:'s)?\s*name)\s*[:-]\s*([A-Za-z][A-Za-z .']{2,60})/i;

function parseAmount(value) {
  if (!value) return null;
  const lower = value.toLowerCase();
  const m = lower.match(/\d[\d,]*(?:\.\d+)?/);
  if (!m) return null;
  let amount = Number(m[0].replace(/,/g, ''));
  if (lower.includes('crore')) amount *= 10000000;
  else if (lower.includes('lakh') || lower.includes('lac')) amount *= 100000;
  return amount > 0 ? Math.round(amount) : null;
}

const titleCase = (s) =>
  s
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');

/** Same text patterns the real ProfileExtractor uses when the AI is off. */
export function extractProfileFromText(text) {
  const name = text.match(NAME)?.[1]?.split(/\n/)[0];
  const email = text.match(EMAIL)?.[0];
  const phone = text.match(PHONE)?.[0];
  const policyNumber = text.match(POLICY_NUMBER)?.[1];
  const sum = text.match(SUM_INSURED)?.[1];
  return {
    name: name ? titleCase(name) : null,
    email: email ? email.toLowerCase() : null,
    phone: phone ?? null,
    policyNumber: policyNumber ? policyNumber.toUpperCase() : null,
    coverageLimit: parseAmount(sum),
    method: 'pattern',
    note: 'Read from your PDF on this demo site (the full app uses AI and also reads photos). Please check every field.',
  };
}
