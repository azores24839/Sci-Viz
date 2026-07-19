import { prisma } from '../prisma.js';

export type QsTopUniversitySource = {
  name: string;
  url: string;
  university: string;
  focus: 'core' | 'engineering' | 'life_med';
};

// QS 2027 non-China cohort.  Each university gets a core research/news entry
// plus engineering and life-science/medicine entry points for a comparable first pass.
export const QS_TOP_UNIVERSITY_SOURCES: QsTopUniversitySource[] = [
  ['Caltech', 'Caltech Research', 'https://www.caltech.edu/research', 'core'],
  ['Caltech', 'Caltech Medical Engineering', 'https://mede.caltech.edu/', 'engineering'],
  ['Caltech', 'Caltech Biology & Biological Engineering', 'https://www.bbe.caltech.edu/news', 'life_med'],
  ['UCL', 'UCL News', 'https://www.ucl.ac.uk/news', 'core'],
  ['UCL', 'UCL Engineering News', 'https://www.ucl.ac.uk/engineering/news', 'engineering'],
  ['UCL', 'UCL Medical Sciences News', 'https://www.ucl.ac.uk/medical-sciences/news', 'life_med'],
  ['NTU Singapore', 'NTU Research Hub', 'https://www.ntu.edu.sg/research/research-hub', 'core'],
  ['NTU Singapore', 'NTU College of Engineering News', 'https://www.ntu.edu.sg/engineering/news-and-events', 'engineering'],
  ['NTU Singapore', 'NTU Lee Kong Chian Medicine News', 'https://www.ntu.edu.sg/medicine/news-events', 'life_med'],
  ['University of Pennsylvania', 'Penn Today', 'https://penntoday.upenn.edu/', 'core'],
  ['University of Pennsylvania', 'Penn Engineering News', 'https://news.seas.upenn.edu/', 'engineering'],
  ['University of Pennsylvania', 'Penn Medicine News', 'https://www.pennmedicine.org/news', 'life_med'],
  ['Cornell University', 'Cornell Chronicle', 'https://news.cornell.edu/', 'core'],
  ['Cornell University', 'Cornell Chronicle Engineering', 'https://news.cornell.edu/categories/engineering', 'engineering'],
  ['Cornell University', 'Cornell Engineering Innovations in Medicine', 'https://engineeringmedicine.cornell.edu/', 'life_med'],
  ['UNSW Sydney', 'UNSW Newsroom', 'https://www.unsw.edu.au/newsroom', 'core'],
  ['UNSW Sydney', 'UNSW Engineering News', 'https://www.unsw.edu.au/engineering/news-and-events', 'engineering'],
  ['UNSW Sydney', 'UNSW Biomedical Engineering News', 'https://www.unsw.edu.au/engineering/our-schools/biomedical-engineering/news-events', 'life_med'],
  ['Johns Hopkins University', 'Johns Hopkins Hub', 'https://hub.jhu.edu/', 'core'],
  ['Johns Hopkins University', 'Johns Hopkins Engineering News', 'https://engineering.jhu.edu/news/', 'engineering'],
  ['Johns Hopkins University', 'Johns Hopkins Biomedical Engineering News', 'https://www.bme.jhu.edu/news-events/news/?type=research', 'life_med'],
  ['UC Berkeley', 'Berkeley News', 'https://news.berkeley.edu/', 'core'],
  ['UC Berkeley', 'Berkeley Engineering News', 'https://engineering.berkeley.edu/news/', 'engineering'],
  ['UC Berkeley', 'Berkeley Biological Sciences News', 'https://biology.berkeley.edu/home', 'life_med'],
  ['EPFL', 'EPFL News', 'https://news.epfl.ch/', 'core'],
  ['EPFL', 'EPFL Engineering News', 'https://www.epfl.ch/schools/sti/', 'engineering'],
  ['EPFL', 'EPFL Bioengineering News', 'https://www.epfl.ch/research/domains/bioengineering/', 'life_med'],
  ['University of Melbourne', 'Melbourne Research News', 'https://research.unimelb.edu.au/strengths/updates/news', 'core'],
  ['University of Melbourne', 'Melbourne Engineering News', 'https://eng.unimelb.edu.au/news', 'engineering'],
  ['University of Melbourne', 'Melbourne Medicine News', 'https://medicine.unimelb.edu.au/news', 'life_med'],
  ['University of Chicago', 'UChicago News', 'https://news.uchicago.edu/', 'core'],
  ['University of Chicago', 'UChicago PME News', 'https://pme.uchicago.edu/news-events/news', 'engineering'],
  ['University of Chicago', 'UChicago Medicine News', 'https://www.uchicagomedicine.org/forefront', 'life_med'],
  ['Technical University of Munich', 'TUM News', 'https://www.tum.de/en/news-and-events/all-news', 'core'],
  ['Technical University of Munich', 'TUM School of Engineering News', 'https://www.tum.de/en/about-tum/structure/faculties/department-of-engineering', 'engineering'],
  ['Technical University of Munich', 'TUM School of Medicine News', 'https://www.mri.tum.de/en/news', 'life_med'],
  ['Princeton University', 'Princeton Research', 'https://www.princeton.edu/research', 'core'],
  ['Princeton University', 'Princeton Engineering News', 'https://engineering.princeton.edu/news', 'engineering'],
  ['Princeton University', 'Princeton Life Sciences Research News', 'https://research.princeton.edu/news/life-sciences', 'life_med'],
  ['University of Sydney', 'University of Sydney News', 'https://www.sydney.edu.au/news-opinion.html', 'core'],
  ['University of Sydney', 'Sydney Engineering Research', 'https://www.sydney.edu.au/engineering/our-research.html', 'engineering'],
  ['University of Sydney', 'Sydney Medicine Research', 'https://www.sydney.edu.au/medicine-health/our-research.html', 'life_med'],
].map(([university, name, url, focus]) => ({ university, name, url, focus: focus as QsTopUniversitySource['focus'] }));

export async function seedQsTopUniversitySources() {
  let created = 0;
  let skipped = 0;
  for (const source of QS_TOP_UNIVERSITY_SOURCES) {
    const existing = await prisma.crawlSource.findFirst({ where: { name: source.name, url: source.url } });
    if (existing) { skipped++; continue; }
    await prisma.crawlSource.create({ data: {
      name: source.name,
      url: source.url,
      sourceType: source.focus === 'life_med' ? 'university_research_portal' : 'university_news',
      category: 'QS27',
      crawlTier: 'A',
      crawlStatus: 'active_static',
      adapterType: 'static_html',
      visualValue: `${source.university} ${source.focus === 'core' ? '核心科研/新闻' : source.focus === 'engineering' ? '理工科研' : '生命科学与医学'}图像与研究传播素材`,
      strategyHint: '首轮仅抓取站内文章页；保留图片、标题、图注和原始 URL；不运行 OCR。',
      notes: `QS 2027 非中国高校补采｜${source.university}｜${source.focus}`,
      enabled: true,
    }});
    created++;
  }
  return { created, skipped };
}
