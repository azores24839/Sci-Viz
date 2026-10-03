#!/usr/bin/env bash
# Isolated fixtures only. No production database, credentials or ports are used.
set -euo pipefail
image=${1:?Usage: container_smoke.sh IMAGE}
work=$(mktemp -d)
container="case-hub-smoke-${RANDOM}-$$"
cleanup() {
  docker rm -f "$container" >/dev/null 2>&1 || true
  # Fixture files were created by the image user; remove them using that same user.
  docker run --rm -v "$work:/fixture" --entrypoint sh "$image" -c 'find /fixture -mindepth 1 -maxdepth 1 -exec rm -rf {} +' >/dev/null 2>&1 || true
  rm -rf "$work"
}
trap cleanup EXIT
mkdir -p "$work/prisma" "$work/uploads/originals" "$work/uploads/thumbnails" "$work/journal_covers" "$work/backups"
mounts=(-v "$work/prisma:/app/sci-viz-case-hub/server/prisma" -v "$work/uploads:/app/sci-viz-case-hub/server/uploads" -v "$work/journal_covers:/app/journal_covers" -v "$work/backups:/app/sci-viz-case-hub/server/backups")
environment=(-e NODE_ENV=production -e DATABASE_URL=file:/app/sci-viz-case-hub/server/prisma/dev.db -e JWT_SECRET=fixture-only-jwt-secret-at-least-32-characters -e CORS_ORIGINS=https://case-hub.example.test -e STUDIO_SERVICE_KEY=fixture-only-service-secret-at-least-32-characters)
if docker run --rm "${mounts[@]}" "${environment[@]}" "$image" > "$work/missing-db.log" 2>&1; then
  echo 'Missing production database was unexpectedly initialized' >&2; exit 1
fi
grep -q 'Refusing to create a new production database' "$work/missing-db.log"
[ ! -f "$work/prisma/dev.db" ]
# Create a full-schema fixture with the real Prisma engine and image processor.
docker run --rm "${mounts[@]}" "${environment[@]}" --entrypoint sh "$image" -c '
  cd /app/sci-viz-case-hub/server
  cp /app/prisma-template/schema.prisma prisma/schema.prisma
  node node_modules/prisma/build/index.js db push --skip-generate
  node --input-type=module -e '\''
    import {PrismaClient} from "@prisma/client";
    import sharp from "sharp";
    import bcrypt from "bcryptjs";
    import {readFile} from "node:fs/promises";
    import {createHash} from "node:crypto";
    const db=new PrismaClient();
    await sharp({create:{width:160,height:120,channels:3,background:"red"}}).png().toFile("uploads/originals/fixture.png");
    await sharp("uploads/originals/fixture.png").resize(20).png().toFile("uploads/thumbnails/fixture.png");
    await sharp("uploads/originals/fixture.png").png().toFile("/app/journal_covers/fixture.png");
    await db.visualCase.create({data:{id:"smoke-case",title:"Fixture",imageHash:createHash("sha256").update(await readFile("uploads/originals/fixture.png")).digest("hex"),imagePath:"/uploads/originals/fixture.png",thumbnailPath:"/uploads/thumbnails/fixture.png",functionalPurpose:"解释",distributionMedium:"静图",technicalMethod:"绘设"}});
    await db.user.create({data:{username:"smoke-user",passwordHash:await bcrypt.hash("fixture-password-only",10)}});
    await db.$disconnect();
  '\''
'
script_dir=$(cd "$(dirname "$0")" && pwd)
# Full-library snapshot is taken while no fixture writer is running.
python3 "$script_dir/data_snapshot.py" snapshot --db "$work/prisma/dev.db" --uploads "$work/uploads" --journal-covers "$work/journal_covers" --output "$work/snapshot" --writers-stopped
docker run --rm "${mounts[@]}" --entrypoint sh "$image" -c 'printf "stale invalid schema\n" > /app/sci-viz-case-hub/server/prisma/schema.prisma'
docker run -d --name "$container" --read-only --tmpfs /tmp:size=128m "${mounts[@]}" "${environment[@]}" "$image" >/dev/null
ready=false
for _ in $(seq 1 30); do
  if docker exec "$container" node -e 'fetch("http://127.0.0.1:3001/api/health").then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))' >/dev/null 2>&1; then ready=true; break; fi
  sleep 2
done
if [ "$ready" != true ]; then docker logs "$container"; exit 1; fi
! grep -q 'stale invalid schema' "$work/prisma/schema.prisma"
[ "$(find "$work/backups" -name '*.db' | wc -l | tr -d ' ')" -ge 1 ]
docker exec -w /app/sci-viz-case-hub/server "$container" node --input-type=module -e '
  import assert from "node:assert/strict";
  import {readFile} from "node:fs/promises";
  import sharp from "sharp";
  import {PrismaClient} from "@prisma/client";
  const base="http://127.0.0.1:3001";
  for(const path of ["/","/api/health","/api/cases","/api/insights/three-axis-spectrum","/uploads/originals/fixture.png","/uploads/thumbnails/fixture.png","/journal_covers/fixture.png"]){
    const r=await fetch(base+path); assert.equal(r.status,200,path);
  }
  assert.equal((await fetch(base+"/api/auth/register",{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"})).status,404);
  const login=await fetch(base+"/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:"smoke-user",password:"fixture-password-only"})});
  assert.equal(login.status,200);
  const cookie=login.headers.get("set-cookie"); assert.match(cookie,/Secure/i); assert.match(cookie,/HttpOnly/i);
  const check=await fetch(base+"/api/auth/check",{headers:{Cookie:cookie.split(";")[0]}});
  assert.equal((await check.json()).success,true);
  const body=new FormData(); body.set("image_file",new Blob([await readFile("uploads/originals/fixture.png")],{type:"image/png"}),"fixture.png"); body.set("source_url","https://example.test/fixture");
  const uploaded=await fetch(base+"/api/captures",{method:"POST",headers:{Cookie:cookie.split(";")[0]},body});
  assert.equal(uploaded.status,200); const uploadResult=await uploaded.json(); assert.equal(uploadResult.success,true); assert.equal(uploadResult.duplicate,true); assert.equal(uploadResult.data.id,"smoke-case");
  const fresh=new FormData(); fresh.set("image_file",new Blob([await sharp({create:{width:800,height:600,channels:3,background:"blue"}}).png().toBuffer()],{type:"image/png"}),"new.png");
  const captured=await fetch(base+"/api/captures",{method:"POST",headers:{Cookie:cookie.split(";")[0]},body:fresh}); assert.equal(captured.status,200);
  const freshResult=await captured.json(); assert.equal(freshResult.success,true); assert.notEqual(freshResult.duplicate,true);
  for(const path of [freshResult.data.imagePath,freshResult.data.thumbnailPath]) assert.equal((await fetch(base+path)).status,200);
  const invalid=new FormData(); invalid.set("image_file",new Blob(["not an image"],{type:"image/png"}),"invalid.png");
  assert.equal((await fetch(base+"/api/captures",{method:"POST",headers:{Cookie:cookie.split(";")[0]},body:invalid})).status,400);
  const db=new PrismaClient(); assert.equal(await db.visualCase.count(),2);
  assert.equal((await db.$queryRawUnsafe("PRAGMA quick_check"))[0].quick_check,"ok");
  await db.$disconnect();
  console.log("PASS: full-schema startup, real backup, image processing/serving, multipart upload, reads, secure login and database integrity");
'
docker restart "$container" >/dev/null
ready=false
# Reuse readiness check after restart to prove persistence.
for _ in $(seq 1 30); do
  if docker exec -w /app/sci-viz-case-hub/server "$container" node --input-type=module -e 'import {PrismaClient} from "@prisma/client";const d=new PrismaClient();const r=await fetch("http://127.0.0.1:3001/api/health");if(!r.ok||await d.visualCase.count()!==2)process.exit(1);await d.$disconnect();' >/dev/null 2>&1; then
    echo 'PASS: restart retains fixture database'; ready=true; break
  fi
  sleep 2
done
if [ "$ready" != true ]; then docker logs "$container"; exit 1; fi
# Simulate writes after a release, then roll data back to the pre-release snapshot.
docker exec -w /app/sci-viz-case-hub/server "$container" node --input-type=module -e 'import {PrismaClient} from "@prisma/client"; const d=new PrismaClient(); await d.visualCase.create({data:{id:"after-release",title:"Post-release fixture"}}); await d.$disconnect();'
docker stop "$container" >/dev/null
python3 "$script_dir/data_snapshot.py" restore --snapshot "$work/snapshot" --target "$work/restored"
python3 "$script_dir/data_snapshot.py" verify --snapshot "$work/snapshot" --target "$work/restored"
docker rm "$container" >/dev/null
mounts=(-v "$work/restored/prisma:/app/sci-viz-case-hub/server/prisma" -v "$work/restored/uploads:/app/sci-viz-case-hub/server/uploads" -v "$work/restored/journal_covers:/app/journal_covers" -v "$work/restored/backups:/app/sci-viz-case-hub/server/backups")
docker run -d --name "$container" --read-only --tmpfs /tmp:size=128m "${mounts[@]}" "${environment[@]}" "$image" >/dev/null
for _ in $(seq 1 30); do
  if docker exec -w /app/sci-viz-case-hub/server "$container" node --input-type=module -e '
    import assert from "node:assert/strict"; import {PrismaClient} from "@prisma/client";
    const r=await fetch("http://127.0.0.1:3001/api/health"); assert.equal(r.status,200);
    const d=new PrismaClient(); assert.equal(await d.visualCase.count(),1); assert.equal(await d.user.count(),1); assert.equal(await d.visualCase.findUnique({where:{id:"after-release"}}),null);
    for(const path of ["/uploads/originals/fixture.png","/uploads/thumbnails/fixture.png","/journal_covers/fixture.png"]) assert.equal((await fetch("http://127.0.0.1:3001"+path)).status,200);
    await d.$disconnect();
  ' >/dev/null 2>&1; then
    echo 'PASS: whole-library restore and data rollback retain users and images'; exit 0
  fi
  sleep 2
done
docker logs "$container"
exit 1
