import { Link, Route, Routes, useNavigate } from 'react-router-dom'
import { getToken, getUser, logout } from './api'
import BenefitDetail from './pages/BenefitDetail'
import Login from './pages/Login'
import MyScreenings from './pages/MyScreenings'
import Questionnaire from './pages/Questionnaire'
import Register from './pages/Register'
import Results from './pages/Results'

export default function App() {
  const navigate = useNavigate()
  const loggedIn = Boolean(getToken())
  const user = getUser()

  const handleLogout = async () => {
    await logout()
    navigate('/')
    window.location.reload()
  }

  return (
    <>
      <header className="nav">
        <Link to="/" className="nav-brand">CareCompass</Link>
        <nav className="nav-links">
          {loggedIn ? (
            <>
              <Link to="/screenings">My screenings</Link>
              <span className="nav-user">{user?.displayName || user?.email}</span>
              <button className="nav-logout" onClick={handleLogout}>Log out</button>
            </>
          ) : (
            <>
              <Link to="/login">Log in</Link>
              <Link to="/register">Sign up</Link>
            </>
          )}
        </nav>
      </header>
      <Routes>
        <Route path="/" element={<Questionnaire />} />
        <Route path="/results" element={<Results />} />
        <Route path="/benefits/:id" element={<BenefitDetail />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/screenings" element={<MyScreenings />} />
      </Routes>
    </>
  )
}
