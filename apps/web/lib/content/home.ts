import type { Locale } from '../tenant/request-context';

/**
 * MOCK homepage content, per locale. This stands in for content the BACKEND will
 * serve (translated articles, sections, etc.) in the next phase — it is NOT a UI
 * dictionary. It exists so the proof surface has real words to typeset and so the
 * Hindi render exercises the script-resilient `:lang()` type system end to end.
 *
 * Crucially, NO brand name/logo lives here — brand is tenant config, read via the
 * config provider. Locales without content fall back to English (the type system
 * still applies the correct script font when selected).
 */

export interface StoryItem {
  id: string;
  category: string;
  title: string;
  dek?: string;
  author: string;
  role?: string;
  readTime?: string;
  views?: string;
  size: 'xl' | 'l' | 'm' | 's';
}

export interface FooterColumn {
  heading: string;
  links: string[];
}

export interface HomeContent {
  edition: string;
  date: string;
  weather: { temp: string; city: string; meta: string };
  searchPlaceholder: string;
  login: string;
  subscribe: string;
  nav: string[];
  todayLabel: string;
  stories: StoryItem[];
  footerTagline: string;
  footerColumns: FooterColumn[];
}

const EN: HomeContent = {
  edition: 'International Edition',
  date: 'Thursday, 25 June 2026',
  weather: { temp: '34°', city: 'New Delhi', meta: 'Clear sky' },
  searchPlaceholder: 'Search…',
  login: 'Log in',
  subscribe: 'Subscribe',
  nav: ['Home', 'India', 'World', 'Business', 'Sport', 'Culture'],
  todayLabel: "Today's Report",
  stories: [
    {
      id: 's1',
      category: 'Economy',
      title: 'Economy shows resilience as growth beats every estimate',
      dek: 'Domestic demand and a rebound in exports point to steady momentum through the coming quarters.',
      author: 'Arya Mehta',
      role: 'Senior Correspondent',
      readTime: '6 min read',
      size: 'xl',
    },
    {
      id: 's2',
      category: 'Science',
      title: 'Scientists unveil a more diverse map of the human genome',
      author: 'Neha Verma',
      role: 'Senior Correspondent',
      readTime: '7 min read',
      size: 'l',
    },
    {
      id: 's3',
      category: 'Cities',
      title: 'A subway killing stuns, and divides, the capital',
      author: 'Rohan Gupta',
      readTime: '5 min read',
      size: 'm',
    },
    {
      id: 's4',
      category: 'Culture',
      title: 'Film festival crowns three independent Indian films',
      author: 'Neha Verma',
      readTime: '4 min read',
      size: 'm',
    },
    {
      id: 's5',
      category: 'Policy',
      title: 'Government offers guidance to avoid a fiscal standoff',
      author: 'Rohan Gupta',
      role: 'Staff Reporter',
      size: 's',
    },
    {
      id: 's6',
      category: 'Business',
      title: 'The startups betting everything on profitability',
      author: 'Arya Mehta',
      views: '23k views',
      size: 's',
    },
  ],
  footerTagline: 'Independent, reader-funded journalism — in your language.',
  footerColumns: [
    { heading: 'Sections', links: ['India', 'World', 'Business', 'Sport', 'Culture', 'Opinion'] },
    { heading: 'Editions', links: ['International', 'हिन्दी', 'தமிழ்', 'বাংলা', 'اردو'] },
    { heading: 'Company', links: ['About us', 'Editorial code', 'Careers', 'Contact', 'RSS feeds'] },
  ],
};

const HI: HomeContent = {
  edition: 'अंतरराष्ट्रीय संस्करण',
  date: 'गुरुवार, 25 जून 2026',
  weather: { temp: '34°', city: 'नई दिल्ली', meta: 'साफ़ आसमान' },
  searchPlaceholder: 'खोजें…',
  login: 'लॉग इन',
  subscribe: 'सदस्यता लें',
  nav: ['मुख्य', 'देश', 'विदेश', 'बिज़नेस', 'खेल', 'संस्कृति'],
  todayLabel: 'आज की रिपोर्ट',
  stories: [
    {
      id: 's1',
      category: 'अर्थव्यवस्था',
      title: 'हर अनुमान से बेहतर विकास, अर्थव्यवस्था में मज़बूती के संकेत',
      dek: 'घरेलू माँग और निर्यात में सुधार आने वाली तिमाहियों में स्थिर रफ़्तार की ओर इशारा करते हैं।',
      author: 'आर्या मेहता',
      role: 'वरिष्ठ संवाददाता',
      readTime: '6 मिनट पढ़ें',
      size: 'xl',
    },
    {
      id: 's2',
      category: 'विज्ञान',
      title: 'वैज्ञानिकों ने जारी किया मानव जीनोम का अधिक विविध नक्शा',
      author: 'नेहा वर्मा',
      role: 'वरिष्ठ संवाददाता',
      readTime: '7 मिनट पढ़ें',
      size: 'l',
    },
    {
      id: 's3',
      category: 'शहर',
      title: 'मेट्रो में हत्या से सहमी और बँटी राजधानी',
      author: 'रोहन गुप्ता',
      readTime: '5 मिनट पढ़ें',
      size: 'm',
    },
    {
      id: 's4',
      category: 'संस्कृति',
      title: 'फ़िल्म समारोह में तीन स्वतंत्र भारतीय फ़िल्मों को पुरस्कार',
      author: 'नेहा वर्मा',
      readTime: '4 मिनट पढ़ें',
      size: 'm',
    },
    {
      id: 's5',
      category: 'नीति',
      title: 'वित्तीय गतिरोध टालने के लिए सरकार ने जारी किया दिशानिर्देश',
      author: 'रोहन गुप्ता',
      role: 'स्टाफ़ रिपोर्टर',
      size: 's',
    },
    {
      id: 's6',
      category: 'बिज़नेस',
      title: 'मुनाफ़े पर सब कुछ दाँव पर लगाते स्टार्टअप',
      author: 'आर्या मेहता',
      views: '23k व्यूज़',
      size: 's',
    },
  ],
  footerTagline: 'स्वतंत्र, पाठक-वित्तपोषित पत्रकारिता — आपकी भाषा में।',
  footerColumns: [
    { heading: 'वर्ग', links: ['देश', 'विदेश', 'बिज़नेस', 'खेल', 'संस्कृति', 'विचार'] },
    { heading: 'संस्करण', links: ['International', 'हिन्दी', 'தமிழ்', 'বাংলা', 'اردو'] },
    { heading: 'कंपनी', links: ['हमारे बारे में', 'संपादकीय संहिता', 'करियर', 'संपर्क', 'RSS फ़ीड'] },
  ],
};

const CONTENT: Partial<Record<Locale, HomeContent>> = { en: EN, hi: HI };

/** Resolve homepage content for a locale, falling back to English. */
export function getHomeContent(locale: Locale): HomeContent {
  return CONTENT[locale] ?? EN;
}
