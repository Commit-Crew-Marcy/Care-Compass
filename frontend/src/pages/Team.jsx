import { useMemo } from 'react'
import { useSetPageContext } from '../pageContext'
import ibrahimaSyPhoto from '../assets/team/ibrahima-sy.jpg'
import zoulkarneinPhoto from '../assets/team/zoulkarnein.jpg'
import asharPhoto from '../assets/team/ashar.jpg'

// One place to update if a headshot ever needs to be swapped to a
// different file — nothing else on this page needs to change.
const TEAM_MEMBERS = [
  {
    name: 'Ibrahima Sy',
    role: 'Tech Lead',
    photo: ibrahimaSyPhoto,
    description:
      'Led the technical architecture and helped connect the CareCompass frontend, backend, eligibility engine, authentication, and deployment systems.',
    linkedin: 'https://www.linkedin.com/in/ibrahima-sy-584361390/?skipRedirect=true',
  },
  {
    name: 'Zoulkarnein',
    role: 'Project Lead',
    photo: zoulkarneinPhoto,
    description:
      'Helped guide the product vision, organize priorities, and keep the team focused on the needs of people searching for benefit information.',
    linkedin: 'https://www.linkedin.com/in/zoulkarnein/?skipRedirect=true',
  },
  {
    name: 'Ashar',
    role: 'Scrum Master',
    photo: asharPhoto,
    description:
      'Supported sprint planning, team communication, documentation, and collaboration throughout the CareCompass development process.',
    linkedin: 'https://www.linkedin.com/in/-maz/',
  },
]

const PROJECT_PRINCIPLES = [
  'Rules determine possible benefit matches',
  'AI explains results in plain language',
  'Government agencies make final decisions',
]

export default function Team() {
  const pageContext = useMemo(
    () => ({
      route: '/team',
      pageTitle: 'CareCompass Meet the Team',
      heading: 'Meet the team',
      sectionHeadings: ['Our capstone project'],
      visibleControls: [],
      visibleLinks: [],
    }),
    []
  )
  useSetPageContext(pageContext)

  return (
    <main className="page-wrap team-page">
      <p className="team-eyebrow">The people behind CareCompass</p>
      <h1>Meet the team</h1>
      <p className="subtitle team-intro">
        CareCompass was created by students in the Marcy Lab School Applied AI Engineering
        Residency. Our capstone project focuses on making government benefit information
        easier to understand and navigate.
      </p>
      <p className="disclaimer team-trust">
        We built CareCompass to provide clear guidance, not to replace government agencies.
        Official agencies make all final eligibility decisions.
      </p>

      <div className="team-grid">
        {TEAM_MEMBERS.map((member) => (
          <div className="team-card" key={member.name}>
            <img
              className="team-card-photo"
              src={member.photo}
              alt={`Headshot of ${member.name}`}
            />
            <div className="team-card-body">
              <div className="team-card-heading-row">
                <h2 className="team-card-name">{member.name}</h2>
                <a
                  className="team-card-linkedin"
                  href={member.linkedin}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${member.name}'s LinkedIn profile (opens in a new tab)`}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <path d="M4.98 3.5C4.98 4.881 3.87 6 2.5 6S.02 4.881.02 3.5C.02 2.12 1.13 1 2.5 1s2.48 1.12 2.48 2.5zM5 8H0v16h5V8zm7.982 0H8.014v16h4.969v-8.399c0-4.67 6.029-5.052 6.029 0V24h4.988v-9.869c0-7.88-8.922-7.593-11.018-3.714V8z" />
                  </svg>
                </a>
              </div>
              <p className="team-card-role">{member.role}</p>
              <p className="team-card-desc">{member.description}</p>
            </div>
          </div>
        ))}
      </div>

      <section className="team-project" aria-labelledby="team-project-heading">
        <h2 id="team-project-heading" className="home-section-heading">Our capstone project</h2>
        <p>
          CareCompass is an AI-supported benefits navigator for older adults, families, people
          with disabilities, low-income individuals, and immigrants who are new to the United
          States.
        </p>
        <ul className="team-principles">
          {PROJECT_PRINCIPLES.map((principle) => (
            <li key={principle}>{principle}</li>
          ))}
        </ul>
        <p className="disclaimer">
          CareCompass is a student capstone project and is not a government agency.
        </p>
      </section>
    </main>
  )
}
