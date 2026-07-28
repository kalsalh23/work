import { useState, useRef } from 'react'
import { jsPDF } from 'jspdf'
import html2canvas from 'html2canvas'

export default function WorkDoc() {
  const [form, setForm] = useState({
    projectName: '',
    clientName: '',
    location: '',
    startDate: '',
    endDate: '',
    description: '',
    details: '',
    notes: '',
  })
  const [images, setImages] = useState([])
  const [imagePreviews, setImagePreviews] = useState([])
  const [generating, setGenerating] = useState(false)
  const docRef = useRef(null)

  function handleChange(e) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  function handleImages(e) {
    const files = Array.from(e.target.files)
    setImages((prev) => [...prev, ...files])
    files.forEach((file) => {
      const preview = URL.createObjectURL(file)
      setImagePreviews((prev) => [...prev, preview])
    })
  }

  function removeImage(index) {
    setImages((prev) => prev.filter((_, i) => i !== index))
    setImagePreviews((prev) => {
      URL.revokeObjectURL(prev[index])
      return prev.filter((_, i) => i !== index)
    })
  }

  async function generatePDF() {
    setGenerating(true)
    try {
      const input = docRef.current
      const canvas = await html2canvas(input, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
      })
      const imgData = canvas.toDataURL('image/jpeg', 0.95)
      const pdf = new jsPDF('p', 'mm', 'a4')
      const pdfWidth = pdf.internal.pageSize.getWidth()
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width
      let heightLeft = pdfHeight
      let position = 0

      pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, pdfHeight)
      heightLeft -= pdf.internal.pageSize.getHeight()

      while (heightLeft > 0) {
        position = heightLeft - pdfHeight
        pdf.addPage()
        pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, pdfHeight)
        heightLeft -= pdf.internal.pageSize.getHeight()
      }

      const fileName = `توثيق_عمل_${form.projectName || 'مشروع'}_${new Date().toLocaleDateString('en-CA')}.pdf`
      pdf.save(fileName)
    } catch (err) {
      alert('فشل إنشاء PDF: ' + err.message)
    }
    setGenerating(false)
  }

  return (
    <div className="workdoc">
      <div className="page-title">
        <div className="title-icon">📋</div>
        <h2>توثيق العمل</h2>
      </div>

      <div className="workdoc-layout">
        <div className="workdoc-form">
          <div className="form-card">
            <span className="card-label">اسم المشروع</span>
            <input name="projectName" value={form.projectName} onChange={handleChange} placeholder="أدخل اسم المشروع" required />
          </div>

          <div className="form-row">
            <div className="form-card">
              <span className="card-label">اسم العميل</span>
              <input name="clientName" value={form.clientName} onChange={handleChange} placeholder="اسم العميل" />
            </div>
            <div className="form-card">
              <span className="card-label">الموقع</span>
              <input name="location" value={form.location} onChange={handleChange} placeholder="موقع العمل" />
            </div>
          </div>

          <div className="form-row">
            <div className="form-card">
              <span className="card-label">تاريخ البدء</span>
              <input type="date" name="startDate" value={form.startDate} onChange={handleChange} />
            </div>
            <div className="form-card">
              <span className="card-label">تاريخ الانتهاء</span>
              <input type="date" name="endDate" value={form.endDate} onChange={handleChange} />
            </div>
          </div>

          <div className="form-card">
            <span className="card-label">وصف العمل</span>
            <textarea name="description" value={form.description} onChange={handleChange} placeholder="وصف تفصيلي للعمل المنجز" rows={4} />
          </div>

          <div className="form-card">
            <span className="card-label">تفاصيل إضافية</span>
            <textarea name="details" value={form.details} onChange={handleChange} placeholder="تفاصيل إضافية (المواد المستخدمة، المقاسات، etc.)" rows={3} />
          </div>

          <div className="form-card">
            <span className="card-label">ملاحظات</span>
            <textarea name="notes" value={form.notes} onChange={handleChange} placeholder="ملاحظات إضافية" rows={2} />
          </div>

          <div className="form-card">
            <span className="card-label">الصور</span>
            <div className="image-upload">
              <label className="image-label">
                <span className="upload-icon">📂</span>
                <span>إضافة صور</span>
                <input type="file" accept="image/*" multiple onChange={handleImages} hidden />
              </label>
              {imagePreviews.length > 0 && (
                <div className="image-previews">
                  {imagePreviews.map((preview, index) => (
                    <div key={index} className="preview-item">
                      <img src={preview} alt={`صورة ${index + 1}`} />
                      <button type="button" className="remove-img-small" onClick={() => removeImage(index)}>&times;</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="workdoc-preview-section">
          <div className="preview-header">
            <span className="preview-icon">👁</span>
            <span>معاينة المستند</span>
          </div>

          <div className="workdoc-preview" ref={docRef}>
            <div className="doc-header">
              <h2>توثيق العمل</h2>
              <p>التاريخ: {new Date().toLocaleDateString('ar-SA')}</p>
            </div>

            <table className="doc-table">
              <tbody>
                {form.projectName && (
                  <tr><td className="doc-label">اسم المشروع</td><td>{form.projectName}</td></tr>
                )}
                {form.clientName && (
                  <tr><td className="doc-label">اسم العميل</td><td>{form.clientName}</td></tr>
                )}
                {form.location && (
                  <tr><td className="doc-label">الموقع</td><td>{form.location}</td></tr>
                )}
                {form.startDate && (
                  <tr><td className="doc-label">تاريخ البدء</td><td>{form.startDate}</td></tr>
                )}
                {form.endDate && (
                  <tr><td className="doc-label">تاريخ الانتهاء</td><td>{form.endDate}</td></tr>
                )}
              </tbody>
            </table>

            {form.description && (
              <div className="doc-section">
                <h3>وصف العمل</h3>
                <p>{form.description}</p>
              </div>
            )}

            {form.details && (
              <div className="doc-section">
                <h3>تفاصيل إضافية</h3>
                <p>{form.details}</p>
              </div>
            )}

            {form.notes && (
              <div className="doc-section">
                <h3>ملاحظات</h3>
                <p>{form.notes}</p>
              </div>
            )}

            {imagePreviews.length > 0 && (
              <div className="doc-section">
                <h3>الصور</h3>
                <div className="doc-images">
                  {imagePreviews.map((preview, index) => (
                    <img key={index} src={preview} alt={`صورة ${index + 1}`} />
                  ))}
                </div>
              </div>
            )}
          </div>

          <button className="pdf-btn" onClick={generatePDF} disabled={generating}>
            {generating ? 'جاري إنشاء PDF...' : '📥 تحميل PDF'}
          </button>
        </div>
      </div>
    </div>
  )
}