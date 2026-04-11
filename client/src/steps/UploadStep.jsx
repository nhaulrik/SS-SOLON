import AppHeader from '../components/AppHeader.jsx'
import Breadcrumbs from '../components/Breadcrumbs.jsx'

export default function UploadStep({
  templateFile,
  stepAnimClass,
  step,
  canNavigateTo,
  navigateTo,
  handleFileUpload
}) {
  return (
    <div className="app">
      <AppHeader
        title="Solon Slide Studio"
        subtitle="Upload a PPTX, tag elements, generate recipe, create presentation"
      />
      <Breadcrumbs step={step} canNavigateTo={canNavigateTo} navigateTo={navigateTo} />

      <div className={stepAnimClass}>
        <div
          className="upload-zone"
          onClick={() => document.getElementById('file-input').click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); handleFileUpload(e) }}
        >
          <input
            type="file"
            id="file-input"
            accept=".pptx"
            style={{ display: 'none' }}
            onChange={handleFileUpload}
          />
          <p>Drop your PPTX here</p>
          <p>or click to browse</p>
        </div>

        {templateFile && (
          <div className="actions" style={{ marginTop: 20 }}>
            <button className="btn btn-primary" onClick={() => navigateTo('tag')}>
              Continue
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
