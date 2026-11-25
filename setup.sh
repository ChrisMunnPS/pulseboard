#!/usr/bin/env sh
# Creates .env with generated secrets. Safe to re-run: never overwrites an existing .env.
set -eu
if [ -f .env ]; then echo ".env already exists - leaving it alone."; exit 0; fi
rand() { head -c 96 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c "$1"; }
printf "Admin email [admin@example.com]: "; read -r email; email=${email:-admin@example.com}
pw=$(rand 16)
sed -e "s|^DB_PASSWORD=.*|DB_PASSWORD=$(rand 24)|" \
    -e "s|^JWT_SECRET=.*|JWT_SECRET=$(rand 48)|" \
    -e "s|^ADMIN_EMAIL=.*|ADMIN_EMAIL=$email|" \
    -e "s|^ADMIN_PASSWORD=.*|ADMIN_PASSWORD=$pw|" .env.example > .env
echo "Created .env"
echo "Admin sign-in: $email / $pw"
echo "Next: docker compose up -d, then open http://localhost:3000"
