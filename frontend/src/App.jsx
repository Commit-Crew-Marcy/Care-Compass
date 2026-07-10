import { Routes, Route } from 'react-router-dom'
import Questionnaire from './pages/Questionnaire'
import Results from './pages/Results'
import BenefitDetail from './pages/BenefitDetail'

export default function App() {
  return (
    <>
      <header className="nav">CareCompass</header>
      <Routes>
        <Route path="/" element={<Questionnaire />} />
        <Route path="/results" element={<Results />} />
        <Route path="/benefits/:id" element={<BenefitDetail />} />
      </Routes>
    </>
  )
}
