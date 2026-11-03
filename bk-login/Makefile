DIR := docs/vulnerabilidades
PS  := powershell -NoProfile -ExecutionPolicy Bypass -Command

.PHONY: bajarVulnerabilidades
bajarVulnerabilidades:
	$(PS) "[Console]::OutputEncoding = [Text.Encoding]::UTF8; New-Item -ItemType Directory -Force -Path '$(DIR)' | Out-Null; (gh issue list --state all --limit 1000 --json number,title,body | ConvertFrom-Json) | ForEach-Object { $$n = ($$_.title.Split([IO.Path]::GetInvalidFileNameChars()) -join '_').Trim(); if ($$n.Length -gt 100) { $$n = $$n.Substring(0, 100).Trim() }; ('# ' + $$_.title + [Environment]::NewLine + [Environment]::NewLine + $$_.body) | Out-File -LiteralPath ('$(DIR)/' + $$n + '.md') -Encoding utf8 }"

runLocal:
	$(PS) "python manage.py runserver 172.16.194.119:8000"

	
check:
	-ruff check . > ruff.log 2>&1
	-ruff format --check . >> ruff.log 2>&1
	-flake8 > flake8.log 2>&1
	-python manage.py check > django.log 2>&1
