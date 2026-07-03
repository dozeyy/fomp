import { useState } from 'react'
import { useAppStore } from '../../store'
import { AppSettings, CompressionMode, MinVideoResolution } from '../../../../shared/types'
import './SettingsPage.css'

const api = (window as any).api

type Tab = 'general' | 'compression' | 'advanced'

export function SettingsPage() {
  const { settings, setSettings, setTheme } = useAppStore()
  const [activeTab, setActiveTab] = useState<Tab>('general')
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState(false)

  const update = async <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    const updated: AppSettings = { ...settings, [key]: value }
    setSettings(updated)

    setSaving(true)
    await api.setSettings({ [key]: value })
    setSaving(false)
    setSavedMsg(true)
    setTimeout(() => setSavedMsg(false), 1800)

    if (key === 'theme') {
      const sysTheme = await api.getTheme()
      const resolved = value === 'auto' ? sysTheme : (value as string)
      setTheme(resolved as 'light' | 'dark')
    }
  }

  const handleFolderSelect = async () => {
    const folder = await api.selectFolder()
    if (folder) update('outputFolder', folder)
  }

  const handleReset = async () => {
    if (!confirm('Reset all settings to defaults?')) return
    const fresh = await api.resetSettings()
    setSettings(fresh)
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'general', label: 'General' },
    { id: 'compression', label: 'Compression' },
    { id: 'advanced', label: 'Advanced' }
  ]

  return (
    <div className="settings-page">
      <div className="settings-header">
        <h1 className="settings-title">Settings</h1>
        <div className="settings-status">
          {saving && <span className="status-saving">Saving…</span>}
          {savedMsg && !saving && <span className="status-saved">Saved</span>}
        </div>
      </div>

      <div className="settings-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`settings-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="settings-body">
        {activeTab === 'general' && (
          <div className="settings-section">
            <SettingsGroup title="App Behavior">
              <SettingsToggle
                label="Launch on startup"
                description="Start Fomp when Windows boots"
                checked={settings.launchOnStartup}
                onChange={(v) => update('launchOnStartup', v)}
              />
              <SettingsToggle
                label="Minimize to tray"
                description="Keep running in the system tray when closed"
                checked={settings.minimizeToTray}
                onChange={(v) => update('minimizeToTray', v)}
              />
              <SettingsToggle
                label="Check for updates"
                description="Automatically check for new versions"
                checked={settings.checkForUpdates}
                onChange={(v) => update('checkForUpdates', v)}
              />
            </SettingsGroup>

            <SettingsGroup title="Appearance">
              <SettingsSelect
                label="Theme"
                description="App color scheme"
                value={settings.theme}
                options={[
                  { value: 'auto', label: 'System Default' },
                  { value: 'dark', label: 'Dark' },
                  { value: 'light', label: 'Light' }
                ]}
                onChange={(v) => update('theme', v as AppSettings['theme'])}
              />
            </SettingsGroup>

            <SettingsGroup title="Danger Zone">
              <div className="settings-row">
                <div className="settings-row-info">
                  <span className="settings-row-label">Reset all settings</span>
                  <span className="settings-row-desc">Restore all settings to their defaults</span>
                </div>
                <button className="btn-danger-sm" onClick={handleReset}>Reset</button>
              </div>
            </SettingsGroup>
          </div>
        )}

        {activeTab === 'compression' && (
          <div className="settings-section">
            <SettingsGroup title="Auto Compression">
              <SettingsToggle
                label="Auto-fit to target size"
                description="Always compress to fit within the target size limit"
                checked={settings.autoFitDiscord}
                onChange={(v) => update('autoFitDiscord', v)}
              />
            </SettingsGroup>

            <SettingsGroup title="Default Behavior">
              <SettingsSelect
                label="Compression mode"
                description="Default mode applied to all files"
                value={settings.defaultMode}
                options={[
                  { value: 'auto', label: 'Auto (Recommended)' },
                  { value: 'quality', label: 'Quality Priority' },
                  { value: 'size', label: 'Size Priority' },
                  { value: 'target', label: 'Target Size' }
                ]}
                onChange={(v) => update('defaultMode', v as CompressionMode)}
              />

              <SettingsNumber
                label="Target file size"
                description="Maximum output size in MB"
                value={settings.targetSizeMB}
                min={1}
                max={500}
                suffix="MB"
                onChange={(v) => update('targetSizeMB', v)}
              />
            </SettingsGroup>

            <SettingsGroup title="Video">
              <SettingsSelect
                label="Minimum video quality"
                description="Lowest resolution Fomp will encode to when compressing large videos. Higher = better looking but may not hit the target size."
                value={settings.minVideoResolution ?? '720p'}
                options={[
                  { value: '1080p', label: '1080p — Highest quality (may not reach small targets)' },
                  { value: '720p',  label: '720p — Balanced (recommended)' },
                  { value: '480p',  label: '480p — Most aggressive compression' },
                ]}
                onChange={(v) => update('minVideoResolution', v as MinVideoResolution)}
              />
            </SettingsGroup>

            <SettingsGroup title="Output">
              <SettingsToggle
                label="Keep original files"
                description="Never delete the source file after compression"
                checked={settings.keepOriginals}
                onChange={(v) => update('keepOriginals', v)}
              />

              <div className="settings-row">
                <div className="settings-row-info">
                  <span className="settings-row-label">Output folder</span>
                  <span className="settings-row-desc">
                    {settings.outputFolder || 'Same folder as original file'}
                  </span>
                </div>
                <button className="btn-outline" onClick={handleFolderSelect}>
                  Choose…
                </button>
              </div>

              {settings.outputFolder && (
                <div className="settings-row">
                  <div className="settings-row-info">
                    <span className="settings-row-label truncate" style={{ maxWidth: 280 }}>
                      {settings.outputFolder}
                    </span>
                  </div>
                  <button className="btn-ghost-sm" onClick={() => update('outputFolder', '')}>
                    Reset
                  </button>
                </div>
              )}

              <SettingsSelect
                label="Filename conflicts"
                description="What to do when the output file already exists"
                value={settings.overwriteBehavior}
                options={[
                  { value: 'rename', label: 'Rename (add suffix)' },
                  { value: 'overwrite', label: 'Overwrite' }
                ]}
                onChange={(v) => update('overwriteBehavior', v as AppSettings['overwriteBehavior'])}
              />
            </SettingsGroup>
          </div>
        )}

        {activeTab === 'advanced' && (
          <div className="settings-section">
            <SettingsGroup title="Performance">
              <SettingsToggle
                label="Hardware acceleration"
                description="Use GPU for faster encoding when available"
                checked={settings.hardwareAcceleration}
                onChange={(v) => update('hardwareAcceleration', v)}
              />
              <SettingsToggle
                label="Background processing"
                description="Continue compressing when the window is minimized"
                checked={settings.backgroundProcessing}
                onChange={(v) => update('backgroundProcessing', v)}
              />
              <SettingsNumber
                label="Parallel threads"
                description="Number of files to compress simultaneously"
                value={settings.parallelThreads}
                min={1}
                max={8}
                suffix="threads"
                onChange={(v) => update('parallelThreads', v)}
              />
              <SettingsNumber
                label="CPU usage limit"
                description="Maximum CPU percentage Fomp may use"
                value={settings.cpuUsageLimit}
                min={10}
                max={100}
                suffix="%"
                onChange={(v) => update('cpuUsageLimit', v)}
              />
            </SettingsGroup>
          </div>
        )}
      </div>
    </div>
  )
}

// --- Sub-components ---

function SettingsGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="settings-group">
      <h3 className="settings-group-title">{title}</h3>
      <div className="settings-group-body">{children}</div>
    </div>
  )
}

function SettingsToggle({
  label,
  description,
  checked,
  onChange
}: {
  label: string
  description: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="settings-row">
      <div className="settings-row-info">
        <span className="settings-row-label">{label}</span>
        <span className="settings-row-desc">{description}</span>
      </div>
      <button
        role="switch"
        aria-checked={checked}
        className={`toggle ${checked ? 'on' : ''}`}
        onClick={() => onChange(!checked)}
      >
        <span className="toggle-thumb" />
      </button>
    </div>
  )
}

function SettingsSelect({
  label,
  description,
  value,
  options,
  onChange
}: {
  label: string
  description: string
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
}) {
  return (
    <div className="settings-row">
      <div className="settings-row-info">
        <span className="settings-row-label">{label}</span>
        <span className="settings-row-desc">{description}</span>
      </div>
      <select
        className="settings-select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )
}

function SettingsNumber({
  label,
  description,
  value,
  min,
  max,
  suffix,
  onChange
}: {
  label: string
  description: string
  value: number
  min: number
  max: number
  suffix: string
  onChange: (v: number) => void
}) {
  return (
    <div className="settings-row">
      <div className="settings-row-info">
        <span className="settings-row-label">{label}</span>
        <span className="settings-row-desc">{description}</span>
      </div>
      <div className="settings-number-wrap">
        <input
          type="number"
          className="settings-number"
          value={value}
          min={min}
          max={max}
          onChange={(e) => {
            const n = parseInt(e.target.value, 10)
            if (!isNaN(n) && n >= min && n <= max) onChange(n)
          }}
        />
        <span className="settings-number-suffix">{suffix}</span>
      </div>
    </div>
  )
}
