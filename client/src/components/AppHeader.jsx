export default function AppHeader({ title, subtitle }) {
  return (
    <header>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1>{title}</h1>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <a href="/docs.html" target="_blank" className="docs-link" title="Open Documentation">
          ⬡ Docs
        </a>
      </div>
    </header>
  )
}
