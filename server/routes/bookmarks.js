import express from 'express';
import pool from '../db.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
};

// Utility function to extract domain from URL
const extractDomain = (url) => {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch (error) {
    return 'favicon';
  }
};

// Generate favicon URL using Google's favicon service
const getFaviconUrl = (url) => {
  const domain = extractDomain(url);
  return `https://www.google.com/s2/favicons?sz=64&domain=${domain}`;
};

// Extract the most useful meta description from HTML.
const extractMetaDescription = (html) => {
  if (!html || typeof html !== 'string') {
    return null;
  }

  const patterns = [
    /<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["'][^>]*>/i,
    /<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:description["'][^>]*>/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      return match[1].replace(/\s+/g, ' ').trim();
    }
  }

  return null;
};

// Extract page <title> text from HTML.
const extractPageTitle = (html) => {
  if (!html || typeof html !== 'string') {
    return null;
  }

  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  if (!match?.[1]) {
    return null;
  }

  return match[1].replace(/\s+/g, ' ').trim() || null;
};

// Protect all bookmark routes
router.use(authenticateToken);

// Get all bookmarks for the authenticated user
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT b.*, 
        COALESCE(
          json_agg(
            json_build_object('id', t.id, 'name', t.name)
          ) FILTER (WHERE t.id IS NOT NULL),
          '[]'
        ) as tags
      FROM bookmarks b
      LEFT JOIN bookmark_tags bt ON b.id = bt.bookmark_id
      LEFT JOIN tags t ON bt.tag_id = t.id
      WHERE b.user_id = $1
      GROUP BY b.id
      ORDER BY b.created_at DESC`,
      [req.user.id]
    );

    const bookmarks = result.rows;

    // Populate missing favicon URLs
    for (const bookmark of bookmarks) {
      if (!bookmark.favicon_url) {
        const faviconUrl = getFaviconUrl(bookmark.url);
        bookmark.favicon_url = faviconUrl;
        // Cache it in the database
        await pool.query(
          'UPDATE bookmarks SET favicon_url = $1 WHERE id = $2',
          [faviconUrl, bookmark.id]
        );
      }
    }

    res.json({ bookmarks });
  } catch (error) {
    console.error('Get bookmarks error:', error);
    res.status(500).json({ error: 'Server error fetching bookmarks' });
  }
});

// Fetch description metadata from a URL (used by the add bookmark form)
router.post('/meta-description', async (req, res) => {
  const { url } = req.body;

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'A valid URL is required' });
  }

  let normalizedUrl = url.trim();
  if (!/^https?:\/\//i.test(normalizedUrl)) {
    normalizedUrl = `https://${normalizedUrl}`;
  }

  try {
    // Validate URL format before making outbound request.
    new URL(normalizedUrl);
  } catch {
    return res.status(400).json({ error: 'Invalid URL format' });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(normalizedUrl, {
      headers: FETCH_HEADERS,
      redirect: 'follow',
      signal: controller.signal,
    });

    const html = await response.text();
    const description = extractMetaDescription(html);

    if (!description) {
      if (!response.ok) {
        return res.status(502).json({ error: `Site blocked the request (HTTP ${response.status}) — try the extension instead, which reads directly from the loaded page` });
      }
      return res.status(404).json({ error: 'No meta description found on this page' });
    }

    res.json({ description });
  } catch (error) {
    if (error?.name === 'AbortError') {
      return res.status(504).json({ error: 'Timed out while fetching site metadata' });
    }
    console.error('Fetch meta description error:', error);
    res.status(500).json({ error: 'Server error fetching site metadata' });
  } finally {
    clearTimeout(timeoutId);
  }
});

// Fetch page metadata (title + description) from a URL
router.post('/meta', async (req, res) => {
  const { url } = req.body;

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'A valid URL is required' });
  }

  let normalizedUrl = url.trim();
  if (!/^https?:\/\//i.test(normalizedUrl)) {
    normalizedUrl = `https://${normalizedUrl}`;
  }

  try {
    new URL(normalizedUrl);
  } catch {
    return res.status(400).json({ error: 'Invalid URL format' });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(normalizedUrl, {
      headers: FETCH_HEADERS,
      redirect: 'follow',
      signal: controller.signal,
    });

    const html = await response.text();
    const title = extractPageTitle(html);
    const description = extractMetaDescription(html);

    if (!title && !description) {
      if (!response.ok) {
        return res.status(502).json({ error: `Site blocked the request (HTTP ${response.status}) — try the extension instead, which reads directly from the loaded page` });
      }
      return res.status(404).json({ error: 'No metadata found on this page' });
    }

    res.json({ title, description });
  } catch (error) {
    if (error?.name === 'AbortError') {
      return res.status(504).json({ error: 'Timed out while fetching site metadata' });
    }
    console.error('Fetch metadata error:', error);
    res.status(500).json({ error: 'Server error fetching site metadata' });
  } finally {
    clearTimeout(timeoutId);
  }
});

// Look up a bookmark by exact URL
router.get('/by-url', async (req, res) => {
  const { url } = req.query;
  if (!url) {
    return res.status(400).json({ error: 'url query parameter is required' });
  }

  try {
    const result = await pool.query(
      `SELECT b.*,
        COALESCE(
          json_agg(
            json_build_object('id', t.id, 'name', t.name)
          ) FILTER (WHERE t.id IS NOT NULL),
          '[]'
        ) as tags
      FROM bookmarks b
      LEFT JOIN bookmark_tags bt ON b.id = bt.bookmark_id
      LEFT JOIN tags t ON bt.tag_id = t.id
      WHERE b.user_id = $1 AND b.url = $2
      GROUP BY b.id`,
      [req.user.id, url]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Bookmark not found' });
    }

    res.json({ bookmark: result.rows[0] });
  } catch (error) {
    console.error('Find by URL error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get a single bookmark
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT b.*, 
        COALESCE(
          json_agg(
            json_build_object('id', t.id, 'name', t.name)
          ) FILTER (WHERE t.id IS NOT NULL),
          '[]'
        ) as tags
      FROM bookmarks b
      LEFT JOIN bookmark_tags bt ON b.id = bt.bookmark_id
      LEFT JOIN tags t ON bt.tag_id = t.id
      WHERE b.id = $1 AND b.user_id = $2
      GROUP BY b.id`,
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Bookmark not found' });
    }

    const bookmark = result.rows[0];

    // Populate missing favicon URL
    if (!bookmark.favicon_url) {
      const faviconUrl = getFaviconUrl(bookmark.url);
      bookmark.favicon_url = faviconUrl;
      // Cache it in the database
      await pool.query(
        'UPDATE bookmarks SET favicon_url = $1 WHERE id = $2',
        [faviconUrl, bookmark.id]
      );
    }

    res.json({ bookmark });
  } catch (error) {
    console.error('Get bookmark error:', error);
    res.status(500).json({ error: 'Server error fetching bookmark' });
  }
});

// Create a new bookmark
router.post('/', async (req, res) => {
  const { title, url, description, tags } = req.body;

  try {
    // Validate input
    if (!title || !url) {
      return res.status(400).json({ error: 'Title and URL are required' });
    }

    // Start transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Insert bookmark
      const faviconUrl = getFaviconUrl(url);
      const bookmarkResult = await client.query(
        'INSERT INTO bookmarks (user_id, title, url, description, favicon_url) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [req.user.id, title, url, description || null, faviconUrl]
      );

      const bookmark = bookmarkResult.rows[0];

      // Process tags if provided
      const bookmarkTags = [];
      if (tags && Array.isArray(tags) && tags.length > 0) {
        for (const tagName of tags) {
          const trimmedTag = tagName.trim().toLowerCase();
          if (trimmedTag) {
            // Validate tag is a single word (no spaces)
            if (/\s/.test(trimmedTag)) {
              await client.query('ROLLBACK');
              return res.status(400).json({ error: `Tag "${tagName}" must be a single word with no spaces` });
            }
            // Insert or get existing tag
            const tagResult = await client.query(
              'INSERT INTO tags (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id',
              [trimmedTag]
            );
            const tagId = tagResult.rows[0].id;

            // Link bookmark to tag
            await client.query(
              'INSERT INTO bookmark_tags (bookmark_id, tag_id) VALUES ($1, $2)',
              [bookmark.id, tagId]
            );

            bookmarkTags.push({ id: tagId, name: trimmedTag });
          }
        }
      }

      await client.query('COMMIT');

      res.status(201).json({
        message: 'Bookmark created successfully',
        bookmark: {
          ...bookmark,
          tags: bookmarkTags,
        },
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Create bookmark error:', error);
    res.status(500).json({ error: 'Server error creating bookmark' });
  }
});

// Update a bookmark
router.put('/:id', async (req, res) => {
  const { title, url, description, tags } = req.body;

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Check if bookmark exists and belongs to user
      const checkResult = await client.query(
        'SELECT * FROM bookmarks WHERE id = $1 AND user_id = $2',
        [req.params.id, req.user.id]
      );

      if (checkResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Bookmark not found' });
      }

      // Update bookmark
      const faviconUrl = getFaviconUrl(url);
      const bookmarkResult = await client.query(
        'UPDATE bookmarks SET title = $1, url = $2, description = $3, favicon_url = $4 WHERE id = $5 AND user_id = $6 RETURNING *',
        [title, url, description || null, faviconUrl, req.params.id, req.user.id]
      );

      const bookmark = bookmarkResult.rows[0];

      // Update tags if provided
      if (tags !== undefined) {
        // Remove existing tags
        await client.query('DELETE FROM bookmark_tags WHERE bookmark_id = $1', [
          bookmark.id,
        ]);

        // Add new tags
        const bookmarkTags = [];
        if (Array.isArray(tags) && tags.length > 0) {
          for (const tagName of tags) {
            const trimmedTag = tagName.trim().toLowerCase();
            if (trimmedTag) {
              // Validate tag is a single word (no spaces)
              if (/\s/.test(trimmedTag)) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: `Tag "${tagName}" must be a single word with no spaces` });
              }
              const tagResult = await client.query(
                'INSERT INTO tags (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id',
                [trimmedTag]
              );
              const tagId = tagResult.rows[0].id;

              await client.query(
                'INSERT INTO bookmark_tags (bookmark_id, tag_id) VALUES ($1, $2)',
                [bookmark.id, tagId]
              );

              bookmarkTags.push({ id: tagId, name: trimmedTag });
            }
          }
        }
        bookmark.tags = bookmarkTags;
      } else {
        // Fetch existing tags if not updating
        const tagsResult = await client.query(
          `SELECT t.id, t.name FROM tags t
          INNER JOIN bookmark_tags bt ON t.id = bt.tag_id
          WHERE bt.bookmark_id = $1`,
          [bookmark.id]
        );
        bookmark.tags = tagsResult.rows;
      }

      await client.query('COMMIT');

      res.json({
        message: 'Bookmark updated successfully',
        bookmark,
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Update bookmark error:', error);
    res.status(500).json({ error: 'Server error updating bookmark' });
  }
});

// Delete a bookmark
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM bookmarks WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Bookmark not found' });
    }

    res.json({ message: 'Bookmark deleted successfully' });
  } catch (error) {
    console.error('Delete bookmark error:', error);
    res.status(500).json({ error: 'Server error deleting bookmark' });
  }
});

// Get all tags for the authenticated user
router.get('/tags/all', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT DISTINCT t.id, t.name, COUNT(bt.bookmark_id) as count
      FROM tags t
      INNER JOIN bookmark_tags bt ON t.id = bt.tag_id
      INNER JOIN bookmarks b ON bt.bookmark_id = b.id
      WHERE b.user_id = $1
      GROUP BY t.id, t.name
      ORDER BY count DESC, t.name ASC`,
      [req.user.id]
    );

    res.json({ tags: result.rows });
  } catch (error) {
    console.error('Get tags error:', error);
    res.status(500).json({ error: 'Server error fetching tags' });
  }
});

export default router;
