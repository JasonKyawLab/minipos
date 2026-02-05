FROM postgres:16

# Set default locale (good practice, avoids collation bugs later)
ENV LANG=C.UTF-8

# Copy SQL init scripts
# These will run ONLY when the database volume is empty
COPY database/init/*.sql /docker-entrypoint-initdb.d/

# Expose default PostgreSQL port
EXPOSE 5432