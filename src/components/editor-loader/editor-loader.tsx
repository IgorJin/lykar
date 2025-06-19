import { h } from "preact"
import { useEffect, useState } from "preact/hooks"
import { fetchPatches } from "@/features/patches/api"
import { CommandJson } from "@/core/command-service/command-types"
import { EditorProvider } from "@/store/editor-сontext"

const EditorLoader = ({ children }: { children: h.JSX.Element }) => {
  const [initialPatches, setInitialPatches] = useState<CommandJson[]>()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      try {
        const loadedPatches = await fetchPatches()

        setInitialPatches(loadedPatches.patches)
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  if (loading) return <div>Loading...</div>;

  return (
    <EditorProvider initialPatches={initialPatches}>
      {children}
    </EditorProvider>
  )
}

export default EditorLoader