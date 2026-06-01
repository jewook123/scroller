const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Default sites config
const defaultSites = [
  {
    id: 'dcinside-film',
    name: 'DC인사이드 - 필름카메라 갤러리',
    type: 'dcinside',
    galleryId: 'film_camera',
    url: 'https://gall.dcinside.com/mgallery/board/lists/?id=film_camera',
    enabled: true,
  },
];

let sites = [...defaultSites];

// Headers to mimic browser
const browserHeaders = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
  'Referer': 'https://gall.dcinside.com/',
};

async function fetchDCInsideImages(galleryId, page = 1) {
  const listUrl = `https://gall.dcinside.com/mgallery/board/lists/?id=${galleryId}&page=${page}`;
  const listRes = await axios.get(listUrl, { headers: browserHeaders, timeout: 10000 });
  const $ = cheerio.load(listRes.data);

  // Collect post links that likely have images
  const postLinks = [];
  $('tr.ub-content').each((_, el) => {
    const $el = $(el);
    // Only posts with image icon
    if ($el.find('td.gall_img').length > 0 || $el.find('em.icon_img').length > 0) {
      const href = $el.find('td.gall_tit a').first().attr('href');
      if (href) postLinks.push('https://gall.dcinside.com' + href);
    }
  });

  // Fetch images from each post (limit to avoid too many requests)
  const images = [];
  const limit = Math.min(postLinks.length, 8);

  await Promise.allSettled(
    postLinks.slice(0, limit).map(async (postUrl) => {
      try {
        const postRes = await axios.get(postUrl, { headers: { ...browserHeaders, Referer: listUrl }, timeout: 8000 });
        const $$ = cheerio.load(postRes.data);
        const title = $$('.gallview_head .title_txt').text().trim() || $$('h4.title').text().trim();

        $$('.write_div img, .s_write img').each((_, img) => {
          let src = $$(img).attr('src') || $$(img).attr('data-src');
          if (src && !src.includes('dccon') && !src.includes('icon') && src.startsWith('http')) {
            images.push({ src, title, postUrl, galleryId });
          }
        });
      } catch (_) {
        // skip failed posts
      }
    })
  );

  return images;
}

// GET /api/sites
app.get('/api/sites', (req, res) => {
  res.json(sites);
});

// POST /api/sites - add site
app.post('/api/sites', (req, res) => {
  const { name, type, galleryId } = req.body;
  if (!name || !type || !galleryId) {
    return res.status(400).json({ error: 'name, type, galleryId are required' });
  }
  const id = `${type}-${galleryId}-${Date.now()}`;
  const url = type === 'dcinside'
    ? `https://gall.dcinside.com/mgallery/board/lists/?id=${galleryId}`
    : `https://gall.dcinside.com/board/lists/?id=${galleryId}`;
  const site = { id, name, type, galleryId, url, enabled: true };
  sites.push(site);
  res.json(site);
});

// PUT /api/sites/:id - update site
app.put('/api/sites/:id', (req, res) => {
  const idx = sites.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  sites[idx] = { ...sites[idx], ...req.body, id: sites[idx].id };
  res.json(sites[idx]);
});

// DELETE /api/sites/:id
app.delete('/api/sites/:id', (req, res) => {
  const idx = sites.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  sites.splice(idx, 1);
  res.json({ ok: true });
});

// GET /api/images?siteId=xxx&page=1
app.get('/api/images', async (req, res) => {
  const { siteId, page = 1 } = req.query;
  const site = siteId ? sites.find(s => s.id === siteId) : sites.find(s => s.enabled);
  if (!site) return res.status(404).json({ error: 'Site not found' });

  try {
    const images = await fetchDCInsideImages(site.galleryId, parseInt(page));
    res.json({ images, site, page: parseInt(page) });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: '이미지를 불러오지 못했습니다: ' + err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
