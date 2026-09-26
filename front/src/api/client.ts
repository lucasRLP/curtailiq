import { API_BASE } from "@/lib/constants"
import type { ApiError } from "@/types/regulatorio"

export class ApiException extends Error {
  code: string
  /** Status HTTP, para a UI distinguir "deu erro" de "ainda não existe". */
  status: number

  constructor(code: string, message: string, status = 0) {
    super(message)
    this.code = code
    this.status = status
  }
}

/**
 * O endpoint ainda não foi publicado pelo backend.
 *
 * As telas de Operação são escritas contra o contrato antes de a rota existir;
 * nesses casos a tela mostra o que vai renderizar e qual rota está esperando,
 * em vez de um erro vermelho que parece defeito do front.
 */
export function endpointIndisponivel(error: unknown): boolean {
  return error instanceof ApiException && (error.status === 404 || error.status === 405 || error.status === 501)
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  })

  if (!res.ok) {
    const body: ApiError = await res.json().catch(() => ({ code: "erro_desconhecido", detail: res.statusText }))
    throw new ApiException(body.code ?? "erro_desconhecido", body.detail ?? res.statusText, res.status)
  }

  return res.json()
}

export const get = <T>(path: string) => request<T>(path)
export const post = <T>(path: string, body: unknown) => request<T>(path, { method: "POST", body: JSON.stringify(body) })
export const patch = <T>(path: string, body: unknown) => request<T>(path, { method: "PATCH", body: JSON.stringify(body) })
