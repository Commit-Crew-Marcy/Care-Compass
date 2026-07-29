import { useEffect, useRef, useState } from 'react'
import { Link, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { getToken, getUser, logout } from './api'
import { goToHowItWorks } from './navigation'
import { PageContextProvider } from './pageContext'
import ChatPanel from './components/ChatPanel'
import BenefitDetail from './pages/BenefitDetail'
import Home from './pages/Home'
import Login from './pages/Login'
import MyScreenings from './pages/MyScreenings'
import Questionnaire from './pages/Questionnaire'
import Register from './pages/Register'
import Results from './pages/Results'
import Team from './pages/Team'

export default function App() {
  const navigate = useNavigate()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const profileMenuRef = useRef(null)
  const loggedIn = Boolean(getToken())
  const user = getUser()
  const profileInitial = (user?.displayName || user?.email || '?').trim().charAt(0).toUpperCase()

  const closeMenu = () => {
    setMenuOpen(false)
    setProfileMenuOpen(false)
  }

  const handleLogout = async () => {
    closeMenu()
    await logout()
    navigate('/')
    window.location.reload()
  }

  // Close the profile dropdown on an outside click, same pattern as any
  // standard account menu (Gmail, etc.) — only listens while it's open.
  useEffect(() => {
    if (!profileMenuOpen) return
    const handleClickOutside = (event) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target)) {
        setProfileMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [profileMenuOpen])

  return (
    <PageContextProvider>
      <header className="nav">
        <div className="nav-inner">
          <Link to="/" className="nav-brand" onClick={closeMenu}>
            <span className="brand-mark" aria-hidden="true" />
            CareCompass
          </Link>

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
            <button
              type="button"
              className="nav-text-btn"
              onClick={() => {
                goToHowItWorks(navigate, location.pathname)
                closeMenu()
              }}
            >
              How It Works
            </button>
            <Link to="/team" onClick={closeMenu}>Meet the Team</Link>
            {loggedIn ? (
              <div className="nav-profile" ref={profileMenuRef}>
                <button
                  type="button"
                  className="nav-profile-btn"
                  aria-haspopup="true"
                  aria-expanded={profileMenuOpen}
                  aria-label="Account menu"
                  onClick={() => setProfileMenuOpen((open) => !open)}
                >
                  {profileInitial}
                </button>
                {profileMenuOpen && (
                  <div className="nav-profile-menu" role="menu">
                    <span className="nav-profile-email">{user?.displayName || user?.email}</span>
                    <Link to="/screenings" className="nav-profile-link" onClick={closeMenu}>
                      🔖 My saved results
                    </Link>
                    <button className="nav-logout" onClick={handleLogout}>Log out</button>
                  </div>
                )}
              </div>
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
        <Route path="/team" element={<Team />} />
      </Routes>

      <ChatPanel />
    </PageContextProvider>
  )
}
