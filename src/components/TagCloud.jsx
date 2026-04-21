import { useState, useEffect, useCallback } from 'react';
import { bookmarksAPI } from '../api/api';
import { Tag, Search, Plus } from 'lucide-react';
import './TagCloud.css';

function TagCloud({ selectedTags = [], onTagToggle, onTagAdd, refreshKey = 0 }) {
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tagSearch, setTagSearch] = useState('');

  const fetchTags = useCallback(async () => {
    try {
      setLoading(true);
      const response = await bookmarksAPI.getAllTags();
      setTags(response.data.tags);
    } catch (error) {
      console.error('Failed to fetch tags:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTags();
  }, [refreshKey, fetchTags]);

  const getTagSize = (index, totalTags) => {
    // Distribute tags in 3 size categories
    if (index === 0) return 'large'; // Most used tag
    if (totalTags <= 3 || index < Math.ceil(totalTags / 2)) return 'medium';
    return 'small';
  };

  const query = tagSearch.trim().toLowerCase();
  const visibleTags = !query
    ? tags
    : tags.filter((tag) => tag.name?.toLowerCase().includes(query));

  return (
    <div className="tag-cloud">
      <div className="tag-cloud-header">
        <h3>
          <Tag size={16} className="tag-cloud-title-icon" />
          <span>Your Tags</span>
        </h3>
        <span className="tag-count">{tags.length}</span>
      </div>

      <div className="tag-cloud-search">
        <Search size={14} className="tag-cloud-search-icon" />
        <input
          type="text"
          value={tagSearch}
          onChange={(e) => setTagSearch(e.target.value)}
          placeholder="Filter tags"
          aria-label="Filter tags"
        />
      </div>

      {loading ? (
        <div className="tag-cloud-loading">Loading tags...</div>
      ) : tags.length === 0 ? (
        <div className="tag-cloud-empty">
          <p>No tags yet. Add bookmarks to create tags!</p>
        </div>
      ) : visibleTags.length === 0 ? (
        <div className="tag-cloud-empty">
          <p>No tags match that filter.</p>
        </div>
      ) : (
        <div className="tag-cloud-items">
          {visibleTags.map((tag, index) => {
            const normalizedTag = tag.name?.toLowerCase();
            const isSelected = selectedTags.includes(normalizedTag);

            return (
              <div
                key={tag.id}
                className={`tag-cloud-item tag-size-${getTagSize(index, visibleTags.length)} ${isSelected ? 'active' : ''}`}
                title={`${tag.count} bookmark${tag.count !== 1 ? 's' : ''}`}
                role="button"
                tabIndex={0}
                onClick={() => onTagToggle?.(tag.name)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onTagToggle?.(tag.name);
                  }
                }}
              >
                <span className="tag-chip-prefix">
                  <button
                    type="button"
                    className={`tag-cloud-chip-plus ${isSelected ? 'active' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onTagAdd?.(tag.name);
                    }}
                    title={isSelected ? 'Already in query' : `Add ${tag.name} to query`}
                    aria-label={isSelected ? `${tag.name} already in query` : `Add ${tag.name} to query`}
                    disabled={isSelected}
                  >
                    <Plus size={11} />
                  </button>
                </span>
                <span className="tag-name">{tag.name}</span>
                <span className="tag-badge">{tag.count}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default TagCloud;
