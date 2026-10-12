'use strict';
/**
 * Seeds the dashboard with a spread of scans so the charts have something to show.
 * Optional: node scripts/seed-demo.js  (wipes existing history first)
 */
const BASE = process.env.BASE || 'http://127.0.0.1:4173';

const TEXTS = [
  { source: 'sample', text: null, kind: 'ai' },
  { source: 'sample', text: null, kind: 'mixed' },
  { source: 'sample', text: null, kind: 'human' },
  {
    text: `In the realm of modern organizational development, fostering a culture of continuous improvement is paramount. Leaders must leverage comprehensive frameworks to empower teams and unlock their full potential. Moreover, a holistic approach ensures that every stakeholder is aligned with the strategic objectives. It is important to note that sustainable transformation requires a delicate balance between innovation and operational excellence. Furthermore, organizations that prioritize inclusive practices consistently demonstrate superior outcomes across a myriad of performance dimensions. Additionally, the integration of data-driven insights enables decision-makers to navigate an ever-evolving business landscape with confidence. Ultimately, embracing a forward-thinking mindset will facilitate meaningful impact and ensure long-term resilience for the enterprise.`
  },
  {
    // deliberately blended: machine paragraph, human paragraph, machine paragraph
    text: `Artificial intelligence has transformed the landscape of modern content creation. In today's fast-paced digital world, organizations must leverage robust frameworks to unlock their full potential. Furthermore, it is important to note that seamless integration fosters meaningful impact across a myriad of dimensions. Ultimately, a comprehensive strategy ensures sustainable growth.

ok so i finally tried the new ramen place near the station and honestly? underwhelming. the broth was fine but 340 rupees for two slices of pork the size of postage stamps is criminal. my friend ordered the spicy version and called it "aggressively mid", which is the most accurate review ive heard all year. i'll probably go back anyway because its a 5 minute walk and theyre open till 2am.

The quarterly outlook remains constructive across all operating segments. Moreover, management expects these trends to continue through the remainder of the fiscal year. Additionally, stakeholders should embrace holistic approaches that foster resilience. In conclusion, a forward-thinking mindset ensures lasting competitive advantage.`
  },
  {
    text: `Subject: Re: invoice 4471

Hi Anita,

just checked the numbers against the PO — the total is off by 1,240 rupees. It looks like the GST line was applied to the base amount twice (row 12 looks suspicious). My finance colleague Ravi flagged something similar on last month's invoice from you, so it might be a template issue rather than a one-off.

Could you send a corrected invoice by Thursday? The payment run goes out Friday at 5pm. Also, we'd like to switch to quarterly billing from October if that's not a hassle. Happy to hop on a call tomorrow after 3 if easier.`
  },
  {
    text: `Here are the key benefits:
- Improved efficiency across workflows
- Enhanced collaboration between teams
- Greater scalability for growing organizations
- Robust security and compliance features
- Seamless integration with existing tools
- Comprehensive analytics and reporting capabilities
- Dedicated support with guaranteed response times`
  },
  {
    text: `yeah i dunno about the new update honestly. it made the export button actually worse?? the thing used to be one click and now its a dropdown with three options and none of them do what i want. asked my brother (he works in QA) and he just laughed. anyway 4/10 not going back to the old version either because the dark mode is nice lol`
  }
];

(async () => {
  await fetch(`${BASE}/api/clear`, { method: 'POST' });
  let i = 0;
  for (const t of TEXTS) {
    let payload = t;
    if (!t.text) {
      const s = await (await fetch(`${BASE}/api/sample?kind=${t.kind}`)).json();
      payload = { text: s.text, source: 'sample' };
    }
    const res = await fetch(`${BASE}/api/analyze`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const r = await res.json();
    i++;
    console.log(`${String(i).padStart(2)}. ${String(r.score).padStart(3)}  ${r.verdict.label}${r.error ? ' — ' + r.error : ''}`);
  }
  const s = await (await fetch(`${BASE}/api/stats`)).json();
  console.log(`\nseeded ${s.total} scans · avg ${s.avgScore} · buckets ${s.buckets.map((b) => `${b.label}=${b.count}`).join(' ')}`);
})();
