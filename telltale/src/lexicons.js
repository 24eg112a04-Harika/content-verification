'use strict';
/**
 * Lexicons used by the TellTale detection engine.
 * Each entry is a phrase or token. Weights: 2 = strong known tell, 1 = mild.
 * Everything here is heuristic stylometry — no model calls, no telemetry.
 */

// Stock phrases that appear far more often in machine-generated prose than in
// human writing. Weighted by how "load-bearing" the tell is in practice.
//
// Optional third element: registers where a phrase is NOT diagnostic, because it is
// ordinary vocabulary there ("furthermore" in an academic paper, "stakeholder" in a
// technical brief). The engine scales that phrase's weight down in those registers.
const ACADEMIC_OK = ['academic', 'legal', 'technical'];
const NORMAL_IN_FORMAL = ['academic', 'legal', 'technical', 'journalistic'];

const MARKER_PHRASES = [
  ['delve into', 2], ['delve', 1.5], ['deep dive', 2], ["let's dive", 2], ['dive into', 1.5],
  ['rich tapestry', 2], ['tapestry', 1.8], ['in the realm of', 2], ['the realm of', 1.8],
  ["it's important to note", 2], ['it is important to note', 2], ['important to note', 1.8],
  ['it is worth noting', 1.6], ['worth noting', 1.4], ['in conclusion', 2, ACADEMIC_OK], ['in summary', 1.4, ACADEMIC_OK],
  ['to summarize', 1.2, ACADEMIC_OK], ['furthermore', 1.8, ACADEMIC_OK], ['moreover', 1.8, ACADEMIC_OK], ['additionally', 1.2, ACADEMIC_OK],
  ['in addition', 1, ACADEMIC_OK], ['in today\'s fast-paced', 2.4], ['fast-paced world', 1.8], ['ever-evolving', 2],
  ['rapidly evolving', 1.4], ['testament to', 2], ['plays a crucial role', 2], ['play a vital role', 2],
  ['plays an important role', 1.6], ['play a key role', 1.4], ['unlock the', 1.6, NORMAL_IN_FORMAL], ['unlock your', 1.4, NORMAL_IN_FORMAL],
  ['elevate your', 1.6], ['game-changer', 1.8], ['game changer', 1.8], ['cutting-edge', 1.6],
  ['state-of-the-art', 1.2], ['seamless', 1.6], ['seamlessly', 1.6], ['holistic', 1.6],
  ['multifaceted', 2], ['myriad', 1.8], ['pivotal', 1.8], ['underscores', 1.8, ACADEMIC_OK], ['underscore', 1.4, ACADEMIC_OK],
  ['harness the', 1.8], ['harnessing', 1.4], ['paradigm shift', 2], ['at its core', 1.6],
  ['when it comes to', 1.2], ['as well as', 0.8, ACADEMIC_OK], ['in order to', 0.8, ACADEMIC_OK], ['a wide range of', 1.2],
  ['a broad range of', 1.2], ['by doing so', 1.4, ACADEMIC_OK], ['this ensures', 1.2, ACADEMIC_OK], ['it is clear that', 1.4, NORMAL_IN_FORMAL],
  ['can be seen as', 1.2, ACADEMIC_OK], ['not only', 0.8, NORMAL_IN_FORMAL], ['but also', 0.8, NORMAL_IN_FORMAL], ['leveraging', 1.6, NORMAL_IN_FORMAL], ['leverage', 1.2, NORMAL_IN_FORMAL],
  ['robust', 1.2, NORMAL_IN_FORMAL], ['foster', 1.2], ['fostering', 1.4], ['embark on', 1.8], ['embarking', 1.6],
  ['journey of', 1.2], ['key takeaway', 1.6], ['takeaways', 1.4], ['in essence', 1.4, NORMAL_IN_FORMAL],
  ['ultimately', 1.2, NORMAL_IN_FORMAL], ['essentially', 1.2, NORMAL_IN_FORMAL], ['landscape of', 1.4], ['the landscape', 1.1],
  ['navigating', 1.4], ['navigate the', 1.4], ['dynamic landscape', 2.2], ['synergy', 1.4],
  ['optimize', 1, NORMAL_IN_FORMAL], ['optimal', 1.1, NORMAL_IN_FORMAL], ['streamline', 1.4, NORMAL_IN_FORMAL], ['empower', 1.4, NORMAL_IN_FORMAL], ['empowering', 1.4, NORMAL_IN_FORMAL],
  ['unleash', 1.6], ['revolutionize', 1.6], ['transformative', 1.6], ['comprehensive', 1.2, ACADEMIC_OK],
  ['crucial', 1.1, ACADEMIC_OK], ['vital', 1.1, ACADEMIC_OK], ['significant', 0.9, NORMAL_IN_FORMAL], ['various', 0.9, NORMAL_IN_FORMAL], ['numerous', 1.2],
  ['essential', 1, NORMAL_IN_FORMAL], ['fundamental', 1.1, NORMAL_IN_FORMAL], ['influential', 1, NORMAL_IN_FORMAL], ['integrity', 0.8, NORMAL_IN_FORMAL], ['commitment to', 0.9],
  ['it is imperative', 1.6], ['paramount', 1.8], ['underscoring', 2, ACADEMIC_OK], ['aforementioned', 1.8, ACADEMIC_OK],
  ['that being said', 1.2, NORMAL_IN_FORMAL], ['having said that', 1.1, NORMAL_IN_FORMAL], ['needless to say', 1.4, NORMAL_IN_FORMAL],
  ['one might argue', 1.2, ACADEMIC_OK], ['it can be argued', 1.4, ACADEMIC_OK], ['on the other hand', 0.9, ACADEMIC_OK],
  ['for instance', 0.7, NORMAL_IN_FORMAL], ['for example', 0.6, NORMAL_IN_FORMAL], ['first and foremost', 1.8], ['last but not least', 1.6],
  ['in the grand scheme', 1.8], ['a myriad of', 2], ['profound', 1.2, NORMAL_IN_FORMAL], ['resonate', 1.1, NORMAL_IN_FORMAL],
  ['realm of', 1.6], ['stakeholders', 1.2, NORMAL_IN_FORMAL], ['framework', 0.9, NORMAL_IN_FORMAL], ['roadmap', 1, NORMAL_IN_FORMAL], ['best practices', 1.2, NORMAL_IN_FORMAL],
  ['dive deeper', 1.6], ['deep understanding', 1.2], ['nuanced', 1.4], ['intricate', 1.6],
  ['holistically', 1.8], ['thoughtful approach', 1.2], ['meaningful impact', 1.4],
  ['lasting impact', 1.2], ['forward-thinking', 1.4], ['future-proof', 1.4]
];

// Formal / academic register words. Heavy use of these in short or personal
// writing is a machine-ish signal; in a journal article it is normal.
const FORMAL_WORDS = [
  'utilize', 'utilizes', 'utilization', 'facilitate', 'facilitates', 'implementation', 'implement',
  'demonstrate', 'demonstrates', 'demonstrating', 'substantial', 'substantially', 'enhance',
  'enhances', 'enhancing', 'optimization', 'methodology', 'methodologies', 'framework', 'frameworks',
  'infrastructure', 'integration', 'integrated', 'cultivate', 'mitigate', 'adhere', 'adheres',
  'commence', 'endeavor', 'inherent', 'inherently', 'intrinsic', 'imperative', 'subsequently',
  'subsequent', 'thereby', 'wherein', 'regarding', 'concerning', 'pertaining', 'constitute',
  'encompass', 'encompasses', 'exemplify', 'exemplifies', 'illustrate', 'illustrates', 'elucidate',
  'articulate', 'advocate', 'ascertain', 'disseminate', 'ameliorate', 'cognizant', 'notwithstanding',
  'henceforth', 'thereafter', 'objectives', 'objective', 'outcomes', 'parameters', 'implications',
  'correlation', 'sustainable', 'sustainability', 'inclusive', 'inclusivity', 'equitable',
  'competencies', 'determinants', 'incentivize', 'operationalize', 'contextualize', 'conceptual',
  'multidisciplinary', 'systematic', 'systematically', 'comprehensive', 'comprehensively',
  'significant', 'significantly', 'effectively', 'efficiently', 'appropriately', 'accordingly'
];

// Discourse markers that machines love to open sentences with.
const DISCOURSE_OPENERS = [
  'however', 'moreover', 'furthermore', 'additionally', 'consequently', 'therefore', 'thus',
  'hence', 'nevertheless', 'nonetheless', 'meanwhile', 'subsequently', 'similarly', 'conversely',
  'overall', 'ultimately', 'firstly', 'secondly', 'thirdly', 'finally', 'notably', 'importantly',
  'indeed', 'likewise', 'accordingly', 'conclusively', 'specifically', 'particularly',
  'in addition', 'in conclusion', 'in summary', 'in essence', 'in other words', 'in contrast',
  'on the other hand', 'for instance', 'for example', 'as such', 'by contrast', 'to that end',
  'at the same time', 'first and foremost', 'that said', 'that being said', 'needless to say'
];

// Sentence openers that machines recycle constantly.
const DETERMINER_OPENERS = ['the', 'this', 'these', 'those', 'it', 'there', 'their', 'that', 'its'];

// Strong human/casual markers. Weight 1 = softer, 2 = very human.
const CASUAL_STRONG = ['lol', 'haha', 'hahaha', 'lmao', 'tbh', 'imo', 'imho', 'btw', 'fwiw',
  'gonna', 'wanna', 'gotta', 'kinda', 'sorta', 'dunno', 'ain\'t', 'yeah', 'yep', 'nope', 'nah',
  'ugh', 'meh', 'whoa', 'oof', 'yikes', 'psst', 'welp', 'anyways', 'cuz', 'cos', 'rite', 'nah'];

const CASUAL_SOFT = ['really', 'honestly', 'literally', 'actually', 'basically', 'anyway', 'super',
  'totally', 'pretty much', 'i think', 'i guess', 'i mean', 'you know', 'stuff', 'things like that',
  'kind of', 'a lot of', 'okay', 'ok', 'cool', 'wow', 'hmm', 'damn', 'heck', 'so yeah', 'right'];

// Words that are commonly written without an apostrophe in casual human text.
const MISSING_APOSTROPHE = ['dont', 'cant', 'wont', 'im', 'ive', 'id', 'youre', 'youve', 'thats',
  'theres', 'heres', 'whats', 'lets', 'isnt', 'arent', 'wasnt', 'didnt', 'doesnt', 'couldnt',
  'wouldnt', 'shouldnt', 'havent', 'hasnt', 'hadnt', 'its a', 'were going', 'ill', 'weve', 'theyre'];

const CONTRACTION_RE = /\b(?:[a-z]+['\u2019](?:s|t|re|ve|ll|d|m)|ain['\u2019]t|y['\u2019]all|gonna|wanna|gotta)\b/gi;
const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}]/u;
const EMOJI_GLOBAL_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/gu;

const FIRST_PERSON = ['i', 'me', 'my', 'mine', 'we', 'us', 'our', 'ours', 'myself', 'ourselves'];

const ABBREVIATIONS = new Set(['mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr', 'st', 'vs', 'etc', 'eg',
  'ie', 'fig', 'al', 'inc', 'ltd', 'co', 'approx', 'est', 'vol', 'ch', 'pp', 'dept', 'univ', 'govt',
  'no', 'nos', 'cf', 'ed', 'eds', 'min', 'max', 'avg', 'am', 'pm', 'phd', 'md', 'ba', 'ma', 'llc',
  'corp', 'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec']);

module.exports = {
  MARKER_PHRASES, ACADEMIC_OK, NORMAL_IN_FORMAL, FORMAL_WORDS, DISCOURSE_OPENERS, DETERMINER_OPENERS,
  CASUAL_STRONG, CASUAL_SOFT, MISSING_APOSTROPHE, CONTRACTION_RE, EMOJI_RE, EMOJI_GLOBAL_RE,
  FIRST_PERSON, ABBREVIATIONS
};
