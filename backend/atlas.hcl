env "local" {
  url = getenv("DATABASE_URL")
  dev = "docker://postgres/16/dev?search_path=public"
  migration {
    dir = "file://migrations"
  }
}

env "ci" {
  url = getenv("TEST_DATABASE_URL")
  migration {
    dir = "file://migrations"
  }
}
