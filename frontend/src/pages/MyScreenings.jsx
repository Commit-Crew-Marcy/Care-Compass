import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { deleteScreening, getToken, listScreenings, updateScreening } from '../api'

// The saved-screenings dashboard: READ (list), UPDATE (rename), DELETE.
// CREATE happens from the Results page after an eligibility check.

export default function MyScreenings() {
  const navigate = useNavigate()
  const [screenings, setScreenings] = useState(null)
  const [error, setError] = useState('')
  const [renamingId, setRenamingId] = useState(null)
  const [newName, setNewName] = useState('')

  useEffect(() => {
    if (!getToken()) {
      navigate('/login')
      return
    }
    listScreenings().then(setScreenings).catch((e) => setError(e.message))
  }, [navigate])

  const startRename = (s) => {
    setRenamingId(s.id)
    setNewName(s.name)
  }

  const saveRename = async (id) => {
    try {
      const updated = await updateScreening(id, { name: newName })
      setScreenings((list) => list.map((s) => (s.id === id ? updated : s)))
      setRenamingId(null)
    } catch (e) {
      setError(e.message)
    }
  }

  const remove = async (id) => {
    if (!confirm('Delete this saved screening? This cannot be undone.')) return
    try {
      await deleteScreening(id)
      setScreenings((list) => list.filter((s) => s.id !== id))
    } catch (e) {
      setError(e.message)
    }
  }

  if (screenings === null && !error) {
    return <main className="container"><p className="loading">Loading your screenings...</p></main>
  }

  return (
    <main className="container">
      <h1>My saved screenings</h1>
      <p className="subtitle">Your past eligibility checks. Rename, review, or delete them.</p>
      {error && <div className="error-box">{error}</div>}

      {screenings?.length === 0 && (
        <div className="card">
          <h2>Nothing saved yet</h2>
          <p>Run the questionnaire and press "Save my results" to keep a screening here.</p>
          <Link className="btn btn-primary" to="/" style={{ marginTop: 14 }}>Start a screening</Link>
        </div>
      )}

      {screenings?.map((s) => (
        <div className="card" key={s.id}>
          {renamingId === s.id ? (
            <div>
              <label htmlFor={`rename-${s.id}`}>New name</label>
              <input id={`rename-${s.id}`} value={newName} onChange={(e) => setNewName(e.target.value)} />
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn btn-primary" onClick={() => saveRename(s.id)}>Save name</button>
                <button className="btn btn-outline" onClick={() => setRenamingId(null)}>Cancel</button>
              </div>
            </div>
          ) : (
            <>
              <h2>{s.name}</h2>
              <p>
                Age {s.age} · ${s.income.toLocaleString()} income · household of {s.householdSize} · {s.state}
              </p>
              <p style={{ marginTop: 6 }}>
                Matched programs: {s.matchedBenefits.length > 0
                  ? s.matchedBenefits.map((b) => b.name).join(', ')
                  : 'none'}
              </p>
              <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                <button className="btn btn-outline" onClick={() => startRename(s)}>Rename</button>
                <button className="btn btn-outline" onClick={() => remove(s.id)}>Delete</button>
              </div>
            </>
          )}
        </div>
      ))}
    </main>
  )
}
