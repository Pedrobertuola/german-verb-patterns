import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { families, verbs, type Verb } from './data/verbs'

const STORAGE_KEY = 'german-verb-patterns-progress-v1'

const FORM_STEPS = [
  {
    name: 'Infinitiv',
    key: 'infinitive',
    sentenceKey: 'presentSentence',
  },
  {
    name: 'Präteritum',
    key: 'praeteritum',
    sentenceKey: 'praeteritumSentence',
  },
  {
    name: 'Partizip II',
    key: 'partizip',
    sentenceKey: 'partizipSentence',
  },
] as const

type StepIndex = 0 | 1 | 2 | 3
type FormStepIndex = 0 | 1 | 2

type FamilyRecord = {
  attempts: number
  perfect: number
  mistakes: number
}

type ReviewEntry = {
  verb: Verb
  perfectCycles: number
  mistakes: number
  addedAt: number
}

type ProgressState = {
  xp: number
  streak: number
  bestStreak: number
  answerCount: number
  correctCount: number
  mastery: Record<string, number>
  reviews: Record<string, ReviewEntry>
  familyStats: Record<string, FamilyRecord>
}

type RoundState = {
  verb: Verb
  step: StepIndex
  hadMistake: boolean
  mistakes: number
  patternChoices: string[]
}

type FeedbackState = {
  tone: 'success' | 'error'
  title: string
  detail: string
}

type PendingRoundResult = {
  hadMistake: boolean
  mistakes: number
}

type FamilySummary = {
  family: string
  percent: number
  attempts: number
  perfect: number
  mistakes: number
  inReview: number
}

type InitialSession = {
  progress: ProgressState
  round: RoundState
}

function createDefaultProgress(): ProgressState {
  return {
    xp: 0,
    streak: 0,
    bestStreak: 0,
    answerCount: 0,
    correctCount: 0,
    mastery: {},
    reviews: {},
    familyStats: {},
  }
}

function loadProgress(): ProgressState {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)

    if (!stored) {
      return createDefaultProgress()
    }

    const parsed = JSON.parse(stored) as Partial<ProgressState>
    const defaults = createDefaultProgress()

    return {
      ...defaults,
      ...parsed,
      mastery: parsed.mastery ?? defaults.mastery,
      reviews: parsed.reviews ?? defaults.reviews,
      familyStats: parsed.familyStats ?? defaults.familyStats,
    }
  } catch {
    return createDefaultProgress()
  }
}

function saveProgress(progress: ProgressState) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(progress))
}

function verbId(verb: Verb) {
  return verb.infinitive
}

function shuffle<T>(items: T[]) {
  return [...items].sort(() => Math.random() - 0.5)
}

function familyToTokens(family: string) {
  if (family.startsWith('-en')) {
    const rest = family.slice(3)
    const tail = rest.startsWith('-') ? rest.slice(1).split('-').filter(Boolean) : []

    return ['-en', ...tail]
  }

  if (family === 'other') {
    return ['other']
  }

  return family.split('-')
}

function tokenLabel(token: string) {
  return token === 'other' ? 'outro' : token
}

function buildPatternChoices(correctFamily: string) {
  const distractors = shuffle(families.filter((family) => family !== correctFamily)).slice(0, 2)
  return shuffle([correctFamily, ...distractors])
}

function pickNextVerb(progress: ProgressState, previousId?: string) {
  const reviewIds = Object.keys(progress.reviews).filter((id) => id !== previousId)
  const shouldReview = reviewIds.length > 0 && Math.random() < 0.7
  const reviewPool = reviewIds
    .map((id) => verbs.find((verb) => verbId(verb) === id))
    .filter((verb): verb is Verb => Boolean(verb))
  const fullPool = verbs.filter((verb) => verbId(verb) !== previousId)
  const pool = shouldReview && reviewPool.length > 0 ? reviewPool : fullPool

  return pool[Math.floor(Math.random() * pool.length)] ?? verbs[0]
}

function createRound(progress: ProgressState, previousId?: string): RoundState {
  const verb = pickNextVerb(progress, previousId)

  return {
    verb,
    step: 0,
    hadMistake: false,
    mistakes: 0,
    patternChoices: buildPatternChoices(verb.family),
  }
}

function createInitialSession(): InitialSession {
  const progress = loadProgress()

  return {
    progress,
    round: createRound(progress),
  }
}

function normalizeAnswer(value: string) {
  return value.trim().toLocaleLowerCase('de-DE').normalize('NFC').replace(/ß/g, 'ss')
}

function isVowel(char: string) {
  return ['a', 'e', 'i', 'o', 'u'].includes(char.toLocaleLowerCase('de-DE'))
}

function fillVowelsInWord(word: string, vowels: string[]) {
  let vowelIndex = 0

  return Array.from(word)
    .map((char) => {
      if (!isVowel(char)) {
        return char
      }

      const answer = vowels[vowelIndex] ?? ''
      vowelIndex += 1
      return answer
    })
    .join('')
}

function addReviewEntry(
  reviews: Record<string, ReviewEntry>,
  verb: Verb,
  shouldReset: boolean,
) {
  const id = verbId(verb)
  const existing = reviews[id]

  return {
    ...reviews,
    [id]: {
      verb,
      perfectCycles: shouldReset ? 0 : existing?.perfectCycles ?? 0,
      mistakes: (existing?.mistakes ?? 0) + 1,
      addedAt: existing?.addedAt ?? Date.now(),
    },
  }
}

function finishCycle(
  progress: ProgressState,
  verb: Verb,
  result: PendingRoundResult,
): ProgressState {
  const id = verbId(verb)
  const familyRecord = progress.familyStats[verb.family] ?? {
    attempts: 0,
    perfect: 0,
    mistakes: 0,
  }
  const familyStats = {
    ...progress.familyStats,
    [verb.family]: {
      attempts: familyRecord.attempts + 1,
      perfect: familyRecord.perfect + (result.hadMistake ? 0 : 1),
      mistakes: familyRecord.mistakes + result.mistakes,
    },
  }
  const mastery = { ...progress.mastery }
  const reviews = { ...progress.reviews }
  let xp = progress.xp

  if (result.hadMistake) {
    if (reviews[id]) {
      reviews[id] = {
        ...reviews[id],
        perfectCycles: 0,
      }
    }
  } else {
    xp += 15
    mastery[id] = Math.min((mastery[id] ?? 0) + 1, 3)

    if (reviews[id]) {
      const perfectCycles = reviews[id].perfectCycles + 1

      if (perfectCycles >= 3) {
        delete reviews[id]
      } else {
        reviews[id] = {
          ...reviews[id],
          perfectCycles,
        }
      }
    }
  }

  return {
    ...progress,
    xp,
    mastery,
    reviews,
    familyStats,
  }
}

function buildFamilySummaries(progress: ProgressState): FamilySummary[] {
  return families.map((family) => {
    const familyVerbs = verbs.filter((verb) => verb.family === family)
    const masteryPoints = familyVerbs.reduce(
      (total, verb) => total + Math.min(progress.mastery[verbId(verb)] ?? 0, 3),
      0,
    )
    const maxPoints = familyVerbs.length * 3
    const record = progress.familyStats[family] ?? {
      attempts: 0,
      perfect: 0,
      mistakes: 0,
    }
    const inReview = familyVerbs.filter((verb) => progress.reviews[verbId(verb)]).length

    return {
      family,
      percent: maxPoints === 0 ? 0 : Math.round((masteryPoints / maxPoints) * 100),
      attempts: record.attempts,
      perfect: record.perfect,
      mistakes: record.mistakes,
      inReview,
    }
  })
}

function ColoredWord({ word, compact = false }: { word: string; compact?: boolean }) {
  return (
    <span className={compact ? 'colored-word compact' : 'colored-word'} aria-label={word}>
      {Array.from(word).map((char, index) => {
        const lower = char.toLocaleLowerCase('de-DE')

        return isVowel(char) ? (
          <span className={`vowel vowel-${lower}`} key={`${char}-${index}`}>
            {char}
          </span>
        ) : (
          <span className="letter" key={`${char}-${index}`}>
            {char}
          </span>
        )
      })}
    </span>
  )
}

function MaskedWord({
  disabled,
  onVowelChange,
  values,
  word,
}: {
  disabled: boolean
  onVowelChange: (index: number, value: string) => void
  values: string[]
  word: string
}) {
  let vowelIndex = 0

  return (
    <span className="masked-word" aria-label={word}>
      {Array.from(word).map((char, index) => {
        if (!isVowel(char)) {
          return (
            <span className="masked-letter" key={`${char}-${index}`}>
              {char}
            </span>
          )
        }

        const currentIndex = vowelIndex
        const value = values[currentIndex] ?? ''
        vowelIndex += 1

        return (
          <input
            aria-label={`Vogal ${currentIndex + 1}`}
            autoCapitalize="none"
            autoComplete="off"
            className={`hidden-vowel-input ${isVowel(value) ? `vowel-fill-${value}` : ''}`}
            data-vowel-index={currentIndex}
            disabled={disabled}
            inputMode="text"
            key={`${char}-${index}`}
            maxLength={1}
            onChange={(event) => onVowelChange(currentIndex, event.target.value)}
            value={value}
          />
        )
      })}
    </span>
  )
}

function SentenceLine({ sentence, answer }: { sentence: string; answer?: string }) {
  const parts = sentence.split('_____')

  return (
    <p className="sentence-line">
      {parts.map((part, index) => (
        <span key={`${part}-${index}`}>
          {part}
          {index < parts.length - 1 ? (
            <span className={answer ? 'sentence-answer' : 'sentence-gap'}>
              {answer ? <ColoredWord word={answer} compact /> : null}
            </span>
          ) : null}
        </span>
      ))}
    </p>
  )
}

function PatternToken({ token }: { token: string }) {
  return (
    <span className="pattern-token">
      {Array.from(tokenLabel(token)).map((char, index) => {
        const lower = char.toLocaleLowerCase('de-DE')

        return isVowel(char) ? (
          <span className={`vowel-box vowel-box-${lower}`} key={`${char}-${index}`}>
            {char}
          </span>
        ) : (
          <span className="plain-token" key={`${char}-${index}`}>
            {char}
          </span>
        )
      })}
    </span>
  )
}

function PatternDisplay({ family }: { family: string }) {
  return (
    <span className="pattern-display" aria-label={tokenLabel(family)}>
      {familyToTokens(family).map((token, index) => (
        <span className="pattern-piece" key={`${token}-${index}`}>
          <PatternToken token={token} />
          {index < familyToTokens(family).length - 1 ? <span className="dash">-</span> : null}
        </span>
      ))}
    </span>
  )
}

function App() {
  const [initialSession] = useState<InitialSession>(() => createInitialSession())
  const [progress, setProgress] = useState<ProgressState>(() => initialSession.progress)
  const [round, setRound] = useState<RoundState>(() => initialSession.round)
  const [vowelAnswers, setVowelAnswers] = useState<string[]>([])
  const [feedback, setFeedback] = useState<FeedbackState | null>(null)
  const [pendingResult, setPendingResult] = useState<PendingRoundResult | null>(null)

  const familySummaries = useMemo(() => buildFamilySummaries(progress), [progress])
  const masteredFamilies = familySummaries.filter((summary) => summary.percent === 100).length
  const accuracy =
    progress.answerCount === 0
      ? 0
      : Math.round((progress.correctCount / progress.answerCount) * 100)
  const currentFormStep = round.step < 3 ? FORM_STEPS[round.step as FormStepIndex] : null
  const reviewCount = Object.keys(progress.reviews).length

  useEffect(() => {
    saveProgress(progress)
  }, [progress])

  function recordAnswer(isCorrect: boolean) {
    setProgress((current) => {
      const streak = isCorrect ? current.streak + 1 : 0
      const xpGain = isCorrect ? (round.step === 3 ? 8 : 5) : 0

      return {
        ...current,
        xp: current.xp + xpGain,
        streak,
        bestStreak: Math.max(current.bestStreak, streak),
        answerCount: current.answerCount + 1,
        correctCount: current.correctCount + (isCorrect ? 1 : 0),
        reviews: isCorrect
          ? current.reviews
          : addReviewEntry(current.reviews, round.verb, true),
      }
    })
  }

  function markRoundMistake() {
    setRound((current) => ({
      ...current,
      hadMistake: true,
      mistakes: current.mistakes + 1,
    }))
  }

  function handleFormSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (feedback) {
      advanceFormStep()
      return
    }

    if (!currentFormStep) {
      return
    }

    const expected = round.verb[currentFormStep.key]
    const answer = fillVowelsInWord(expected, vowelAnswers)
    const isCorrect = normalizeAnswer(answer) === normalizeAnswer(expected)
    recordAnswer(isCorrect)

    if (!isCorrect) {
      markRoundMistake()
    }

    setFeedback({
      tone: isCorrect ? 'success' : 'error',
      title: isCorrect ? 'Certo' : 'Quase',
      detail: expected,
    })
  }

  function advanceFormStep() {
    const nextStep = (round.step + 1) as StepIndex

    setRound((current) => ({
      ...current,
      step: nextStep,
    }))
    setVowelAnswers([])
    setFeedback(null)
  }

  function handleVowelChange(index: number, value: string) {
    const nextValue = Array.from(value).at(-1)?.toLocaleLowerCase('de-DE') ?? ''

    setVowelAnswers((current) => {
      const next = [...current]
      next[index] = nextValue
      return next
    })

    if (nextValue) {
      requestAnimationFrame(() => {
        const nextInput = document.querySelector<HTMLInputElement>(
          `[data-vowel-index="${index + 1}"]`,
        )

        nextInput?.focus()
      })
    }
  }

  function submitPattern(pattern: string) {
    if (feedback || !pattern) {
      return
    }

    const isCorrect = pattern === round.verb.family
    const result = {
      hadMistake: round.hadMistake || !isCorrect,
      mistakes: round.mistakes + (isCorrect ? 0 : 1),
    }

    recordAnswer(isCorrect)

    if (!isCorrect) {
      markRoundMistake()
    }

    setPendingResult(result)
    setFeedback({
      tone: isCorrect ? 'success' : 'error',
      title: isCorrect ? 'Padrão certo' : 'Padrão certo',
      detail: round.verb.family,
    })
  }

  function completeRound() {
    if (!pendingResult) {
      return
    }

    const nextProgress = finishCycle(progress, round.verb, pendingResult)

    setProgress(nextProgress)
    setRound(createRound(nextProgress, verbId(round.verb)))
    setVowelAnswers([])
    setFeedback(null)
    setPendingResult(null)
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">German Verb Patterns</p>
          <h1>Verb Patterns</h1>
        </div>
        <div className="level-pill">
          <span>{progress.xp}</span>
          <small>XP</small>
        </div>
      </header>

      <section className="score-grid" aria-label="Progresso">
        <div className="score-tile">
          <span>{progress.streak}</span>
          <small>streak</small>
        </div>
        <div className="score-tile">
          <span>{reviewCount}</span>
          <small>revisão</small>
        </div>
        <div className="score-tile">
          <span>{masteredFamilies}/{families.length}</span>
          <small>famílias</small>
        </div>
        <div className="score-tile">
          <span>{accuracy}%</span>
          <small>acerto</small>
        </div>
      </section>

      <section className={`practice-card ${feedback?.tone ?? ''}`}>
        <div className="card-topline">
          <p>{currentFormStep?.name ?? 'Padrão'}</p>
          <div className="step-dots" aria-label={`Etapa ${round.step + 1} de 4`}>
            {[0, 1, 2, 3].map((step) => (
              <span className={step === round.step ? 'active' : ''} key={step} />
            ))}
          </div>
        </div>

        {currentFormStep ? (
          <form className="answer-flow" onSubmit={handleFormSubmit}>
            <MaskedWord
              disabled={Boolean(feedback)}
              onVowelChange={handleVowelChange}
              values={vowelAnswers}
              word={round.verb[currentFormStep.key]}
            />
            <SentenceLine sentence={round.verb[currentFormStep.sentenceKey]} />

            {feedback ? (
              <div className="feedback-strip" role="status">
                <strong>{feedback.title}</strong>
                <SentenceLine sentence={round.verb[currentFormStep.sentenceKey]} answer={feedback.detail} />
              </div>
            ) : null}

            <button className="primary-action" type="submit">
              {feedback ? 'Continuar' : 'Conferir'}
            </button>
          </form>
        ) : (
          <div className="pattern-flow">
            <div className="forms-stack" aria-label="Formas">
              <ColoredWord word={round.verb.infinitive} />
              <ColoredWord word={round.verb.praeteritum} />
              <ColoredWord word={round.verb.partizip} />
            </div>

            <h2>Qual é o padrão de vogais?</h2>

            <div className="choice-stack">
              {round.patternChoices.map((family) => (
                <button
                  className="pattern-choice"
                  disabled={Boolean(feedback)}
                  key={family}
                  onClick={() => submitPattern(family)}
                  type="button"
                >
                  <PatternDisplay family={family} />
                </button>
              ))}
            </div>

            {feedback ? (
              <div className="feedback-strip pattern-feedback" role="status">
                <strong>{feedback.title}</strong>
                <PatternDisplay family={feedback.detail} />
              </div>
            ) : null}

            {feedback ? (
              <button className="primary-action" onClick={completeRound} type="button">
                Nova rodada
              </button>
            ) : null}
          </div>
        )}
      </section>

      <section className="review-panel">
        <div>
          <p className="panel-label">Revisão</p>
          <strong>{reviewCount}</strong>
        </div>
        <div>
          <p className="panel-label">Melhor streak</p>
          <strong>{progress.bestStreak}</strong>
        </div>
      </section>

      <section className="family-panel">
        <div className="panel-header">
          <p className="panel-label">Padrões</p>
          <strong>{masteredFamilies} dominadas</strong>
        </div>
        <div className="family-list">
          {familySummaries.map((summary) => (
            <article className="family-row" key={summary.family}>
              <div className="family-line">
                <PatternDisplay family={summary.family} />
                <span>{summary.percent}%</span>
              </div>
              <div className="progress-track" aria-hidden="true">
                <span style={{ width: `${summary.percent}%` }} />
              </div>
              <div className="family-meta">
                <span>{summary.perfect}/{summary.attempts}</span>
                <span>{summary.mistakes} erros</span>
                <span>{summary.inReview} rev.</span>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}

export default App
