
CREATE TABLE "date" ("id" integer,"date" datetime NOT NULL,"processed" int NOT NULL DEFAULT '0', "url" varchar, "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (id));
CREATE UNIQUE INDEX "url_index" ON "date" ("url");

CREATE TABLE "water_level" ("id" integer,"reservoir" varchar NOT NULL,"max_storage" int NOT NULL,"current_storage" int NOT NULL, "date_id" int, "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (id));