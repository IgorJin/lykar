import { h, JSX } from 'preact'
import { useEditor } from '@/store/editor-сontext'
import { useSyncExternalStore } from 'preact/compat'

const PatchesSection = (): JSX.Element => {
  const { services: { commandService } } = useEditor()

  const patches = useSyncExternalStore(
    commandService.subscribe.bind(commandService),
    commandService.getHistory.bind(commandService),
  )

  return (
    <ul>
      {patches.map((patch, index) => (
        <li key={index}>{JSON.stringify(patch)}</li>
      ))}
    </ul>
  )
}

export default PatchesSection