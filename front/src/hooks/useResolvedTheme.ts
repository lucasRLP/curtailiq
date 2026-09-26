import { useEffect, useState } from "react"

/**
 * Tema efetivamente aplicado ("dark" | "light"), inclusive quando o usuário
 * está em "system". O ThemeProvider só expõe a preferência, mas o mapa precisa
 * saber o tema resolvido para trocar os tiles — então observamos a classe que o
 * provider escreve no <html>.
 */
export function useResolvedTheme(): "dark" | "light" {
  const [resolved, setResolved] = useState<"dark" | "light">(() =>
    typeof document !== "undefined" && document.documentElement.classList.contains("dark") ? "dark" : "light",
  )

  useEffect(() => {
    const root = document.documentElement
    const read = () => setResolved(root.classList.contains("dark") ? "dark" : "light")
    read()

    const observer = new MutationObserver(read)
    observer.observe(root, { attributes: true, attributeFilter: ["class"] })
    return () => observer.disconnect()
  }, [])

  return resolved
}
