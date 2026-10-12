'use strict';
/** Sample texts used by the "try a sample" buttons. */

const SAMPLES = {
  ai: {
    label: 'Generated-sounding marketing copy',
    note: 'Deliberately stuffed with machine habits — long sample.',
    text: `Artificial intelligence has fundamentally transformed the landscape of modern content creation. In today's fast-paced digital world, organizations are increasingly leveraging automated tools to streamline their workflows and enhance overall productivity. It is important to note that these technologies offer a myriad of benefits, ranging from improved operational efficiency to enhanced creative output.

Furthermore, the integration of AI systems into editorial processes represents a paradigm shift in how content is produced, reviewed, and distributed. Moreover, businesses that embrace these solutions can unlock significant value across multiple dimensions. The ability to generate drafts, summarize research, and personalize messaging at scale underscores the transformative potential of this technology.

However, it is worth noting that the adoption of such tools also presents challenges that stakeholders must carefully consider. Additionally, ethical considerations play a crucial role in ensuring responsible implementation. Organizations must therefore establish robust governance frameworks to mitigate risk while fostering innovation.

By understanding both the opportunities and the risks, teams can navigate this ever-evolving landscape effectively. Ultimately, the future of content creation lies in a thoughtful balance between human creativity and technological capability, enabling organizations to achieve meaningful impact at scale. In conclusion, embracing these tools strategically ensures sustainable growth and lasting competitive advantage.`
  },
  human: {
    label: 'Casual human writing',
    note: 'Loose rhythm, typos, contractions, specifics.',
    text: `ok so i finally tried the new ramen place near the station and honestly? underwhelming. the broth was fine — decent depth, right amount of salt — but 340 rupees for two slices of pork the size of postage stamps is criminal. my friend ordered the spicy version and called it "aggressively mid", which is the most accurate review ive heard all year.

i'll probably go back anyway because its a 5 minute walk and theyre open till 2am, but im not recommending it to anyone. some things you keep to yourself. also the guy at the counter was watching cricket on his phone the whole time and yelled when kohli got out, so, points for atmosphere i guess`
  },
  mixed: {
    label: 'Edited human academic prose',
    note: 'Formal register, but a human shape underneath.',
    text: `We set out to test whether retrieval-augmented drafting changes how editors evaluate machine-written paragraphs. Thirty-two editors at two regional papers took part over six weeks. Each saw 480 paragraphs — half written by colleagues, half produced by three different models — with the source labels removed.

Our first experiment, run in March 2024, produced the result we expected: editors spotted the model paragraphs about 61% of the time. The second experiment did not. Once we allowed participants to see the retrieved sources alongside each paragraph, accuracy fell to 54%, though confidence rose. That combination worries us more than the raw accuracy number, because confident-but-wrong judgments are the ones that reach print.

We are not claiming detectors are useless. A stylometric screener like the one built for this study caught the most obvious cases and cost nothing to run. But the pattern across both experiments is hard to explain away: people lean on fluency as a proxy for truth, and fluency is exactly what generators optimize for.`
  }
};

module.exports = { SAMPLES };
