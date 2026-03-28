import { useState, useEffect } from 'react';
import { bookmarksAPI } from '../api/api';
import { Tag } from 'lucide-react';
import './TagCloud.css';

function TagCloud({ selectedTag = '', onTagSelect }) {
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchTags();
  }, []);

  const fetchTags = async () => {
    try {
      setLoading(true);
      const response = await bookmarksAPI.getAllTags();
      setTags(response.data.tags);
    } catch (error) {
      console.error('Failed to fetch tags:', error);
    } finally {
      setLoading(false);
    }
  };

  const getTagSize = (index, totalTags) => {
    // Distribute tags in 3 size categories
    if (index === 0) return 'large'; // Most used tag
    if (totalTags <= 3 || index < Math.ceil(totalTags / 2)) return 'medium';
    return 'small';
  };

  return (
    <div className="tag-cloud">
      <div className="tag-cloud-header">
        <h3>
          <Tag size={16} className="tag-cloud-title-icon" />
          <span>Your Tags</span>
        </h3>
        <span className="tag-count">{tags.length}</span>
      </div>

      {loading ? (
        <div className="tag-cloud-loading">Loading tags...</div>
      ) : tags.length === 0 ? (
        <div className="tag-cloud-empty">
          <p>No tags yet. Add bookmarks to create tags!</p>
        </div>
      ) : (
        <div className="tag-cloud-items">
          {tags.map((tag, index) => (
            <button
              type="button"
              key={tag.id}
              className={`tag-cloud-item tag-size-${getTagSize(index, tags.length)} ${selectedTag?.toLowerCase() === tag.name?.toLowerCase() ? 'active' : ''}`}
              title={`${tag.count} bookmark${tag.count !== 1 ? 's' : ''}`}
              onClick={() => onTagSelect?.(tag.name)}
            >
              <span className="tag-name">{tag.name}</span>
              <span className="tag-badge">{tag.count}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default TagCloud;
