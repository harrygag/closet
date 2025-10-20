import { POST } from '../api/admin/migrate-items'

async function main() {
  const email = process.env.EMAIL || 'harrisonkennedy291@gmail.com'
  const scope = process.env.SCOPE || 'all'

  const req = new Request('http://local/api/admin/migrate-items', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, scope })
  })

  const res = await POST(req)
  const text = await res.text()
  console.log('Status:', res.status)
  console.log(text)
  if (!res.ok) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})


