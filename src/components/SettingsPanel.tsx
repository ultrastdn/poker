import { useState } from 'react'
import { playSound } from '@/game/sound'
import type { Settings, TableConfig } from '@/game/settings'
import { BLIND_PRESETS, STACK_PRESETS } from '@/game/settings'
import { DIFFICULTIES, DIFFICULTY_LABELS, TABLE_SIZES } from '@/game/tables'
import './settings.scss'

type Props = {
  config: TableConfig
  settings: Settings
  onSettings: (patch: Partial<Settings>) => void
  onApply: (config: TableConfig) => void
  onClose: () => void
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className='cfg'>
      <span className='cfg__label'>{label}</span>
      <div className='cfg__row'>{children}</div>
    </div>
  )
}

function Opt({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type='button'
      className={`cfg__opt${active ? ' cfg__opt--on' : ''}`}
      aria-pressed={active}
      onClick={() => {
        playSound('click')
        onClick()
      }}
    >
      {children}
    </button>
  )
}

function Toggle({
  on,
  onClick,
  title,
  desc,
}: {
  on: boolean
  onClick: () => void
  title: string
  desc: string
}) {
  return (
    <button
      type='button'
      className={`sw${on ? ' sw--on' : ''}`}
      aria-pressed={on}
      onClick={() => {
        playSound('click')
        onClick()
      }}
    >
      <span className='sw__knob' />
      <span className='sw__text'>
        <span className='sw__title'>{title}</span>
        <span className='sw__desc'>{desc}</span>
      </span>
    </button>
  )
}

export default function SettingsPanel({ config, settings, onSettings, onApply, onClose }: Props) {
  const [draft, setDraft] = useState<TableConfig>(config)
  const patch = (part: Partial<TableConfig>) => setDraft((prev) => ({ ...prev, ...part }))
  const dirty =
    draft.size !== config.size ||
    draft.difficulty !== config.difficulty ||
    draft.stack !== config.stack ||
    draft.sb !== config.sb ||
    draft.bb !== config.bb

  return (
    <div className='sheet' role='dialog' aria-modal='true' aria-label='牌桌设置'>
      <button className='sheet__scrim' aria-label='关闭设置' onClick={onClose} />
      <div className='sheet__panel'>
        <div className='sheet__grab' />
        <header className='sheet__head'>
          <span className='sheet__eyebrow'>牌桌设置</span>
          <button className='sheet__close' onClick={onClose}>
            关闭
          </button>
        </header>

        <div className='sheet__body'>
          <Row label='人数'>
            {TABLE_SIZES.map((size) => (
              <Opt key={size} active={draft.size === size} onClick={() => patch({ size })}>
                {size} 人
              </Opt>
            ))}
          </Row>

          <Row label='机器人'>
            {DIFFICULTIES.map((difficulty) => (
              <Opt
                key={difficulty}
                active={draft.difficulty === difficulty}
                onClick={() => patch({ difficulty })}
              >
                {DIFFICULTY_LABELS[difficulty]}
              </Opt>
            ))}
          </Row>

          <Row label='起始码'>
            {STACK_PRESETS.map((stack) => (
              <Opt key={stack} active={draft.stack === stack} onClick={() => patch({ stack })}>
                {stack}
              </Opt>
            ))}
          </Row>

          <Row label='盲注'>
            {BLIND_PRESETS.map((blind) => (
              <Opt
                key={`${blind.sb}/${blind.bb}`}
                active={draft.sb === blind.sb && draft.bb === blind.bb}
                onClick={() => patch({ sb: blind.sb, bb: blind.bb })}
              >
                {blind.sb}/{blind.bb}
              </Opt>
            ))}
          </Row>

          <div className='sheet__toggles'>
            <Toggle
              on={settings.coach}
              onClick={() => onSettings({ coach: !settings.coach })}
              title='教练模式'
              desc='轮到你时显示建议动作与理由'
            />
            <Toggle
              on={settings.timer}
              onClick={() => onSettings({ timer: !settings.timer })}
              title='行动计时器'
              desc='每手 20 秒 + 时间银行，超时自动弃牌'
            />
            <Toggle
              on={settings.sound}
              onClick={() => onSettings({ sound: !settings.sound })}
              title='音效'
              desc='发牌、筹码与结算提示音'
            />
          </div>
        </div>

        <footer className='sheet__foot'>
          <button className='btn btn--fold' onClick={onClose}>
            取消
          </button>
          <button
            className='btn btn--raise'
            onClick={() => {
              playSound('chip')
              onApply(draft)
            }}
          >
            {dirty ? '换桌重开' : '重开一桌'}
          </button>
        </footer>
      </div>
    </div>
  )
}
