FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PIP_NO_CACHE_DIR=1
ENV PIP_DEFAULT_TIMEOUT=120
ENV PIP_RETRIES=10

WORKDIR /app

ARG PIP_INDEX_URL=
ARG PIP_TRUSTED_HOST=

COPY requirements.txt ./
RUN if [ -n "$PIP_INDEX_URL" ] && [ -n "$PIP_TRUSTED_HOST" ]; then \
        python -m pip install --index-url "$PIP_INDEX_URL" --trusted-host "$PIP_TRUSTED_HOST" -r requirements.txt; \
    elif [ -n "$PIP_INDEX_URL" ]; then \
        python -m pip install --index-url "$PIP_INDEX_URL" -r requirements.txt; \
    else \
        python -m pip install -r requirements.txt; \
    fi

COPY app ./app
COPY scripts ./scripts
COPY run.py ./
COPY .env.example ./.env.example

RUN mkdir -p /app/data/uploads /app/data/outputs /app/data/workflows

EXPOSE 8000

CMD ["python", "run.py"]
