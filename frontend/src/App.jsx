import { useState } from 'react'
import { Link, Route, Routes, useNavigate } from 'react-router-dom'
import { getToken, getUser, logout } from './api'
import BenefitDetail from './pages/BenefitDetail'
import Home from './pages/Home'
import Login from './pages/Login'
import MyScreenings from './pages/MyScreenings'
import Questionnaire from './pages/Questionnaire'
import Register from './pages/Register'
import Results from './pages/Results'

export default function App() {
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const loggedIn = Boolean(getToken())
  const user = getUser()

  const closeMenu = () => setMenuOpen(false)

  const handleLogout = async () => {
    closeMenu()
    await logout()
    navigate('/')
    window.location.reload()
  }

  return (
    <>
      <header className="nav">
        <div className="nav-inner">
          <Link to="/" className="nav-brand" onClick={closeMenu}>CareCompass</Link>

          <button
            className="nav-menu-btn"
            aria-expanded={menuOpen}
            aria-controls="nav-links"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            onClick={() => setMenuOpen(o => !o)}
          >
            <span className="nav-menu-icon">{menuOpen ? '✕' : '☰'}</span>
          </button>

          <nav id="nav-links" className={`nav-links${menuOpen ? ' nav-links--open' : ''}`}>
            <Link to="/questionnaire" className="nav-find-btn" onClick={closeMenu}>Find Benefits</Link>
            {loggedIn ? (
              <>
                <Link to="/screenings" onClick={closeMenu}>My screenings</Link>
                <span className="nav-user">{user?.displayName || user?.email}</span>
                <button className="nav-logout" onClick={handleLogout}>Log out</button>
              </>
            ) : (
              <>
                <Link to="/login" onClick={closeMenu}>Log in</Link>
                <Link to="/register" onClick={closeMenu}>Sign up</Link>
              </>
            )}
          </nav>
        </div>
      </header>

      {menuOpen && (
        <div className="nav-overlay" onClick={closeMenu} aria-hidden="true" />
      )}

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/questionnaire" element={<Questionnaire />} />
        <Route path="/results" element={<Results />} />
        <Route path="/benefits/:id" element={<BenefitDetail />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/screenings" element={<MyScreenings />} />
      </Routes>
    </>
  )
}
