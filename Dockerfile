FROM python:3.12-slim

WORKDIR /app

# System deps for psycopg2-binary are not needed since we use the binary
# wheel, but libpq runtime is still required at runtime on slim images.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libpq5 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

# --reload is fine for a hackathon dev container; swap for a production
# process manager (e.g. gunicorn+uvicorn workers) before any real deploy.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
