import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { authAPI } from '../api/api';
import { X, KeyRound, Copy, Ban, Eye, EyeOff, Trash2 } from 'lucide-react';
import Import from './Import';
import './Settings.css';

function Settings({ onClose, pageMode = false, onImportComplete }) {
  const { user, updateUser } = useAuth();
  const isSuperAdmin = user?.role === 'super_admin';
  const [activeTab, setActiveTab] = useState('username');
  const [loading, setLoading] = useState(false);
  const [loadingKeys, setLoadingKeys] = useState(false);
  const [loadingAdminUsers, setLoadingAdminUsers] = useState(false);
  const [savingAdminUserId, setSavingAdminUserId] = useState(null);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [apiKeys, setApiKeys] = useState([]);
  const [adminUsers, setAdminUsers] = useState([]);
  const [newKeyName, setNewKeyName] = useState('');
  const [generatedApiKey, setGeneratedApiKey] = useState('');
  const [showRevokedKeys, setShowRevokedKeys] = useState(false);
  const [revealedApiKeys, setRevealedApiKeys] = useState({});

  // Username form state
  const [usernameForm, setUsernameForm] = useState({
    newUsername: user?.username || '',
    password: '',
  });

  // Email form state
  const [emailForm, setEmailForm] = useState({
    newEmail: user?.email || '',
    password: '',
  });

  useEffect(() => {
    setUsernameForm((prev) => ({
      ...prev,
      newUsername: user?.username || '',
    }));

    setEmailForm((prev) => ({
      ...prev,
      newEmail: user?.email || '',
    }));
  }, [user]);

  const handleUsernameChange = (e) => {
    setUsernameForm({
      ...usernameForm,
      [e.target.name]: e.target.value,
    });
    setError('');
  };

  // Password form state
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  const handleEmailChange = (e) => {
    setEmailForm({
      ...emailForm,
      [e.target.name]: e.target.value,
    });
    setError('');
  };

  const handlePasswordChange = (e) => {
    setPasswordForm({
      ...passwordForm,
      [e.target.name]: e.target.value,
    });
    setError('');
  };

  const fetchApiKeys = async () => {
    try {
      setLoadingKeys(true);
      const response = await authAPI.getApiKeys();
      setApiKeys(response.data.apiKeys || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to fetch API keys');
    } finally {
      setLoadingKeys(false);
    }
  };

  const fetchAdminUsers = async () => {
    if (!isSuperAdmin) {
      return;
    }

    try {
      setLoadingAdminUsers(true);
      const response = await authAPI.adminListUsers();
      setAdminUsers(response.data.users || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to fetch users');
    } finally {
      setLoadingAdminUsers(false);
    }
  };

  const handleAdminFieldChange = (id, field, value) => {
    setAdminUsers((prev) =>
      prev.map((member) =>
        member.id === id
          ? { ...member, [field]: value }
          : member
      )
    );
  };

  const handleSaveAdminUser = async (member) => {
    try {
      setSavingAdminUserId(member.id);
      setError('');
      setSuccess('');
      await authAPI.adminUpdateUser(member.id, {
        membershipTier: member.membership_tier,
        role: member.role,
      });
      setSuccess(`Updated ${member.email}`);
      await fetchAdminUsers();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update user access');
    } finally {
      setSavingAdminUserId(null);
    }
  };

  const handleCreateApiKey = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setGeneratedApiKey('');

    try {
      setLoading(true);
      const response = await authAPI.createApiKey(newKeyName);
      setGeneratedApiKey(response.data.apiKey);
      setSuccess('API key created. Copy it now - it will only be shown once.');
      setNewKeyName('');
      await fetchApiKeys();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create API key');
    } finally {
      setLoading(false);
    }
  };

  const handleRevokeApiKey = async (id) => {
    try {
      setError('');
      setSuccess('');
      await authAPI.revokeApiKey(id);
      setSuccess('API key revoked');
      await fetchApiKeys();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to revoke API key');
    }
  };

  const handleDeleteApiKey = async (id) => {
    const confirmed = window.confirm('Delete this API key permanently? This cannot be undone.');
    if (!confirmed) return;

    try {
      setError('');
      setSuccess('');
      await authAPI.deleteApiKey(id);
      setSuccess('API key deleted permanently');
      setRevealedApiKeys((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      await fetchApiKeys();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete API key');
    }
  };

  const handleCopyApiKey = async () => {
    if (!generatedApiKey) return;

    try {
      await navigator.clipboard.writeText(generatedApiKey);
      setSuccess('API key copied to clipboard');
    } catch {
      setError('Unable to copy API key');
    }
  };

  const handleToggleRevealApiKey = (id) => {
    setRevealedApiKeys((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const handleCopyStoredApiKey = async (apiKey) => {
    if (!apiKey) return;

    try {
      await navigator.clipboard.writeText(apiKey);
      setSuccess('API key copied to clipboard');
    } catch {
      setError('Unable to copy API key');
    }
  };

  const visibleApiKeys = showRevokedKeys
    ? apiKeys
    : apiKeys.filter((key) => !key.revoked_at);

  const handleUsernameSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const trimmedUsername = usernameForm.newUsername.trim();

      if (!trimmedUsername || !usernameForm.password) {
        setError('Both fields are required');
        setLoading(false);
        return;
      }

      if (/\s/.test(trimmedUsername)) {
        setError('Username cannot contain spaces');
        setLoading(false);
        return;
      }

      if (trimmedUsername === user?.username) {
        setError('New username must be different from current username');
        setLoading(false);
        return;
      }

      const response = await authAPI.updateUsername(trimmedUsername, usernameForm.password);
      updateUser(response.data.user);
      setSuccess('Username updated successfully!');
      setUsernameForm({
        newUsername: response.data.user.username,
        password: '',
      });
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update username');
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      if (!emailForm.newEmail || !emailForm.password) {
        setError('Both fields are required');
        setLoading(false);
        return;
      }

      if (emailForm.newEmail === user?.email) {
        setError('New email must be different from current email');
        setLoading(false);
        return;
      }

      const response = await authAPI.updateEmail(emailForm.newEmail, emailForm.password);
      updateUser(response.data.user);
      setSuccess('Email updated successfully!');
      setEmailForm({
        newEmail: response.data.user.email,
        password: '',
      });
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update email');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      if (!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
        setError('All fields are required');
        setLoading(false);
        return;
      }

      if (passwordForm.newPassword !== passwordForm.confirmPassword) {
        setError('New passwords do not match');
        setLoading(false);
        return;
      }

      if (passwordForm.newPassword.length < 6) {
        setError('New password must be at least 6 characters');
        setLoading(false);
        return;
      }

      await authAPI.updatePassword(
        passwordForm.currentPassword,
        passwordForm.newPassword,
        passwordForm.confirmPassword
      );
      setSuccess('Password updated successfully!');
      setPasswordForm({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={pageMode ? 'settings-page' : 'settings-container'}>
      <div className={`settings-panel${pageMode ? ' settings-panel-page' : ''}`}>
        <div className="settings-header">
          <h2>Account Settings</h2>
          {!pageMode && (
            <button onClick={onClose} className="close-btn" title="Close settings">
              <X size={18} />
            </button>
          )}
        </div>

        <div className="settings-tabs">
          <button
            className={`tab-btn ${activeTab === 'username' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('username');
              setError('');
              setSuccess('');
              setGeneratedApiKey('');
            }}
          >
            Username
          </button>
          <button
            className={`tab-btn ${activeTab === 'email' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('email');
              setError('');
              setSuccess('');
              setGeneratedApiKey('');
            }}
          >
            Email
          </button>
          <button
            className={`tab-btn ${activeTab === 'password' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('password');
              setError('');
              setSuccess('');
              setGeneratedApiKey('');
            }}
          >
            Password
          </button>
          <button
            className={`tab-btn ${activeTab === 'apiKeys' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('apiKeys');
              setError('');
              setSuccess('');
              fetchApiKeys();
            }}
          >
            API Keys
          </button>
          <button
            className={`tab-btn ${activeTab === 'import' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('import');
              setError('');
              setSuccess('');
            }}
          >
            Import
          </button>
          {isSuperAdmin && (
            <button
              className={`tab-btn ${activeTab === 'admin' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('admin');
                setError('');
                setSuccess('');
                fetchAdminUsers();
              }}
            >
              Admin
            </button>
          )}
        </div>

        {error && <div className="settings-error">{error}</div>}
        {success && <div className="settings-success">{success}</div>}

        {activeTab === 'username' && (
          <form onSubmit={handleUsernameSubmit} className="settings-form">
            <div className="form-field">
              <label htmlFor="current-username">Current Username</label>
              <input
                type="text"
                id="current-username"
                value={user?.username || ''}
                disabled
                className="input-disabled"
              />
            </div>

            <div className="form-field">
              <label htmlFor="new-username">New Username</label>
              <input
                type="text"
                id="new-username"
                name="newUsername"
                value={usernameForm.newUsername}
                onChange={handleUsernameChange}
                required
                minLength={2}
                maxLength={50}
                placeholder="Enter your new username"
                pattern="\S+"
                title="Username cannot contain spaces"
              />
            </div>

            <div className="form-field">
              <label htmlFor="username-password">Password (for verification)</label>
              <input
                type="password"
                id="username-password"
                name="password"
                value={usernameForm.password}
                onChange={handleUsernameChange}
                required
                placeholder="Enter your password"
              />
            </div>

            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Updating...' : 'Update Username'}
            </button>
          </form>
        )}

        {activeTab === 'email' && (
          <form onSubmit={handleEmailSubmit} className="settings-form">
            <div className="form-field">
              <label htmlFor="current-email">Current Email</label>
              <input
                type="email"
                id="current-email"
                value={user?.email || ''}
                disabled
                className="input-disabled"
              />
            </div>

            <div className="form-field">
              <label htmlFor="new-email">New Email</label>
              <input
                type="email"
                id="new-email"
                name="newEmail"
                value={emailForm.newEmail}
                onChange={handleEmailChange}
                required
                placeholder="Enter your new email"
              />
            </div>

            <div className="form-field">
              <label htmlFor="email-password">Password (for verification)</label>
              <input
                type="password"
                id="email-password"
                name="password"
                value={emailForm.password}
                onChange={handleEmailChange}
                required
                placeholder="Enter your password"
              />
            </div>

            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Updating...' : 'Update Email'}
            </button>
          </form>
        )}

        {activeTab === 'password' && (
          <form onSubmit={handlePasswordSubmit} className="settings-form">
            <div className="form-field">
              <label htmlFor="current-password">Current Password</label>
              <input
                type="password"
                id="current-password"
                name="currentPassword"
                value={passwordForm.currentPassword}
                onChange={handlePasswordChange}
                required
                placeholder="Enter your current password"
              />
            </div>

            <div className="form-field">
              <label htmlFor="new-password">New Password</label>
              <input
                type="password"
                id="new-password"
                name="newPassword"
                value={passwordForm.newPassword}
                onChange={handlePasswordChange}
                required
                placeholder="Enter your new password (min 6 characters)"
                minLength={6}
              />
            </div>

            <div className="form-field">
              <label htmlFor="confirm-password">Confirm New Password</label>
              <input
                type="password"
                id="confirm-password"
                name="confirmPassword"
                value={passwordForm.confirmPassword}
                onChange={handlePasswordChange}
                required
                placeholder="Confirm your new password"
                minLength={6}
              />
            </div>

            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Updating...' : 'Update Password'}
            </button>
          </form>
        )}

        {activeTab === 'apiKeys' && (
          <div className="api-keys-panel">
            <form onSubmit={handleCreateApiKey} className="settings-form api-key-create-form">
              <div className="form-field">
                <label htmlFor="api-key-name">Key Name (optional)</label>
                <input
                  type="text"
                  id="api-key-name"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  maxLength={100}
                  placeholder="e.g. Chrome extension"
                />
              </div>

              <button type="submit" className="btn-primary" disabled={loading}>
                <KeyRound size={16} />
                <span>{loading ? 'Generating...' : 'Generate API Key'}</span>
              </button>
            </form>

            {generatedApiKey && (
              <div className="generated-key-box">
                <p className="generated-key-note">Save this key now. It will not be shown again.</p>
                <code>{generatedApiKey}</code>
                <button type="button" className="btn-secondary" onClick={handleCopyApiKey}>
                  <Copy size={16} />
                  <span>Copy Key</span>
                </button>
              </div>
            )}

            <div className="api-keys-list">
              <div className="api-keys-list-header">
                <label className="show-revoked-toggle">
                  <input
                    type="checkbox"
                    checked={showRevokedKeys}
                    onChange={(e) => setShowRevokedKeys(e.target.checked)}
                  />
                  <span>Show revoked keys</span>
                </label>
              </div>

              {loadingKeys ? (
                <p className="api-keys-empty">Loading API keys...</p>
              ) : visibleApiKeys.length === 0 ? (
                <p className="api-keys-empty">No API keys yet.</p>
              ) : (
                visibleApiKeys.map((key) => (
                  <div key={key.id} className="api-key-item">
                    <div>
                      <p className="api-key-name">{key.name}</p>
                      <p className="api-key-meta">
                        {key.key_prefix}...{key.key_last4} • Created {new Date(key.created_at).toLocaleDateString()}
                      </p>
                      {key.api_key ? (
                        <div className="stored-key-row">
                          <code>{revealedApiKeys[key.id] ? key.api_key : `${key.key_prefix}...${key.key_last4}`}</code>
                          <button
                            type="button"
                            className="btn-secondary api-key-action-btn"
                            onClick={() => handleToggleRevealApiKey(key.id)}
                            title={revealedApiKeys[key.id] ? 'Hide API key' : 'Show API key'}
                          >
                            {revealedApiKeys[key.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                            <span>{revealedApiKeys[key.id] ? 'Hide' : 'Show'}</span>
                          </button>
                          {revealedApiKeys[key.id] && (
                            <button
                              type="button"
                              className="btn-secondary api-key-action-btn"
                              onClick={() => handleCopyStoredApiKey(key.api_key)}
                            >
                              <Copy size={14} />
                              <span>Copy</span>
                            </button>
                          )}
                        </div>
                      ) : (
                        <p className="api-key-meta">This key was created before key reveal support and cannot be displayed.</p>
                      )}
                      {key.revoked_at && (
                        <p className="api-key-revoked">Revoked {new Date(key.revoked_at).toLocaleDateString()}</p>
                      )}
                    </div>

                    <div className="api-key-actions">
                      {!key.revoked_at && (
                        <button
                          type="button"
                          className="btn-secondary api-key-revoke-btn"
                          onClick={() => handleRevokeApiKey(key.id)}
                        >
                          <Ban size={15} />
                          <span>Revoke</span>
                        </button>
                      )}
                      {key.revoked_at && (
                        <button
                          type="button"
                          className="btn-secondary api-key-delete-btn"
                          onClick={() => handleDeleteApiKey(key.id)}
                        >
                          <Trash2 size={15} />
                          <span>Delete</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'import' && (
          <div className="settings-import-tab">
            <p className="settings-import-description">
              Import bookmarks from other services into Tagstash.
            </p>
            <Import inline onImportComplete={onImportComplete} />
          </div>
        )}

        {activeTab === 'admin' && isSuperAdmin && (
          <div className="admin-users-panel">
            <p className="admin-users-description">
              Manage account access. Free users are limited to 50 bookmarks; paid users are unlimited.
            </p>

            {loadingAdminUsers ? (
              <p className="admin-users-empty">Loading users...</p>
            ) : adminUsers.length === 0 ? (
              <p className="admin-users-empty">No users found.</p>
            ) : (
              <div className="admin-users-list">
                {adminUsers.map((member) => (
                  <div key={member.id} className="admin-user-row">
                    <div className="admin-user-meta">
                      <p className="admin-user-name">{member.username}</p>
                      <p className="admin-user-email">{member.email}</p>
                      <p className="admin-user-count">Bookmarks: {member.bookmark_count}</p>
                    </div>

                    <div className="admin-user-controls">
                      <label>
                        Tier
                        <select
                          value={member.membership_tier}
                          onChange={(e) =>
                            handleAdminFieldChange(member.id, 'membership_tier', e.target.value)
                          }
                        >
                          <option value="free">free</option>
                          <option value="paid">paid</option>
                        </select>
                      </label>

                      <label>
                        Role
                        <select
                          value={member.role}
                          onChange={(e) => handleAdminFieldChange(member.id, 'role', e.target.value)}
                        >
                          <option value="user">user</option>
                          <option value="super_admin">super_admin</option>
                        </select>
                      </label>

                      <button
                        type="button"
                        className="btn-primary"
                        onClick={() => handleSaveAdminUser(member)}
                        disabled={savingAdminUserId === member.id}
                      >
                        {savingAdminUserId === member.id ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default Settings;
