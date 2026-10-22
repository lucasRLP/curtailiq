import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const source = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8')
test('aviso de demonstração é global e preserva o roteador', () => {
  const app = source('App.tsx')
  assert.ok(app.includes('Demonstração · snapshot histórico local · cenários estimados; não é apuração oficial'))
  assert.ok(app.includes('<RouterProvider router={router} />'))
})
test('mapa mantém base clara e legenda usa a paleta dos marcadores', () => {
  const map = source('pages/Portfolio/MapaUsinas.tsx')
  assert.ok(map.includes('World_Light_Gray_Base'))
  assert.ok(!map.includes('World_Dark_Gray_Base'))
  assert.ok(!map.includes('useResolvedTheme'))
  assert.ok(!map.includes('filter:'))
  assert.ok(map.includes('backgroundColor: estilo.eolica'))
  assert.ok(map.includes('backgroundColor: estilo.solar'))
  assert.ok(map.includes('dashArray: usina.fonte === "solar"'))
})
test('Home declara snapshot, cenários e dependência do assistente', () => {
  const home = source('pages/Home/index.tsx')
  assert.ok(!home.includes('82M+'))
  assert.ok(!home.includes('Zero estimativa inventada'))
  assert.ok(home.includes('Snapshot histórico local'))
  assert.ok(home.includes('depende da configuração do provedor de IA'))
})
