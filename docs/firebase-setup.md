# Firebase / GCP setup — what you do by hand

Terraform owns as much as it usefully can, but a handful of steps either need a
billing account, need org-level permissions, or produce a secret that only the
console can mint. Do these once, in order, then everything else is `terraform
apply`.

Estimated time: **25–35 minutes**, most of it waiting on Workload Identity
Federation.

---

## 0. Tooling

Already on this machine: Node 24.7, npm 11.6, firebase-tools 15.3.1,
Terraform 1.5.7, gcloud 552, corepack 0.34.

pnpm was activated through corepack during scaffolding (`pnpm@10.15.0`, pinned
by the `packageManager` field in `package.json`). If a fresh shell cannot find
it:

```bash
corepack enable pnpm
```

Only one CLI is genuinely missing:

```bash
brew install gh                   # GitHub CLI, for setting repo variables in step 7
```

**One gotcha:** the Firestore emulator is a Java process and firebase-tools 15
refuses anything older than **JDK 21**. This machine has both 17 and 24
installed, with 17 as the default, so `pnpm test:rules` fails until you point it
at the newer one:

```bash
export JAVA_HOME=$(/usr/libexec/java_home -v 24)
export PATH="$JAVA_HOME/bin:$PATH"
```

Worth putting in your shell profile. CI pins JDK 21 explicitly.

Then authenticate:

```bash
firebase login
gcloud auth login
gcloud auth application-default login   # Terraform uses these credentials locally
gh auth login
```

---

## 1. Create the Firebase project

1. Go to <https://console.firebase.google.com> → **Create a project**.
2. Name it `choreo-planner`. Note the **project ID** it generates — it may be
   `choreo-planner` or `choreo-planner-xxxxx` if the name is taken. Everything
   below uses that ID.
3. **Disable Google Analytics** — nothing in this app uses it, and it adds a
   second linked resource for Terraform to trip over.

> Why by hand: creating a project via Terraform needs `roles/resourcemanager.projectCreator`
> at the org or folder level, which a personal Google account does not have.

---

## 2. Enable billing (Blaze plan)

Firebase console → ⚙️ → **Usage and billing** → **Modify plan** → **Blaze
(pay as you go)**.

**You need this even though the app itself is free-tier-sized**, for two
reasons:

- Terraform's remote state lives in a Cloud Storage bucket, and Cloud Storage
  requires a billing account.
- Multiple Hosting sites (the optional staging site) require Blaze.

Realistic cost for one dancer's choreo library: **$0.00/month** — you stay
inside the perpetual free allowances (Firestore 50k reads/20k writes per day,
Hosting 10 GB/month transfer, Auth free at this scale).

**Do this immediately after enabling Blaze:** GCP console →
**Billing → Budgets & alerts → Create budget**, amount **$1**, alert at 50% /
90% / 100%. A budget does not cap spend, but you will hear about it the same day
if something goes wrong.

*No-card alternative:* stay on Spark and put Terraform state in
[HCP Terraform](https://app.terraform.io) (free tier) instead of GCS, and set
`enable_staging_site = false`. The rest of the setup is unchanged.

---

## 3. Register the web app

Firebase console → **Project settings** → **Your apps** → **Web** (`</>` icon).

- Nickname: `choreo-planner-web`
- **Do not** check "Also set up Firebase Hosting" — Terraform handles Hosting.

Copy the config object it shows you. You need these six values:
`apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`,
`appId`.

Put them in a local `.env.local` (gitignored) using `.env.example` as the
template, and add them as GitHub **repository variables** in step 7. These are
public identifiers, not secrets — they ship in the client bundle by design, and
Firestore security rules are what actually protects the data.

---

## 4. Enable the sign-in providers

Firebase console → **Authentication** → **Get started** → **Sign-in method**:

1. Enable **Anonymous**.
2. Enable **Google**. Set the support email to your own. This step silently
   creates the OAuth 2.0 client that Google sign-in needs — which is exactly why
   it is not in Terraform.
3. **Settings → User account management → leave "Auto-delete anonymous users"
   OFF.** If it is on, an unsynced project can disappear after 30 days. See
   [ADR 0003](decisions/0003-auth-anonymous-plus-google.md).
4. **Settings → Authorized domains** — `localhost` and the two Firebase Hosting
   domains are added automatically, which is all that's needed: no custom domain
   is planned. If you add one later, it must be registered here too or Google
   sign-in will fail on it.

---

## 5. Create the Terraform state bucket

Chicken-and-egg: Terraform's state has to live somewhere Terraform did not
create. One command, once:

```bash
export PROJECT_ID=choreo-planner        # your actual project ID from step 1

gcloud config set project "$PROJECT_ID"
gcloud storage buckets create "gs://${PROJECT_ID}-tfstate" \
  --location=EU \
  --uniform-bucket-level-access \
  --public-access-prevention
gcloud storage buckets update "gs://${PROJECT_ID}-tfstate" --versioning
```

Use `--location=US` if you would rather keep everything in the US; it only has
to match your own preference, not the Firestore location.

---

## 6. First Terraform run

Variables live in `terraform/prod.auto.tfvars`, which is **committed** — CI and
your laptop must read the same inputs. Edit it first if your project ID picked
up a random suffix:

```hcl
project_id          = "choreo-planner"
firestore_location  = "eur3"
github_repository   = "DianaAnton/choreo-planner"
enable_staging_site = false
```

Then:

```bash
cd terraform
terraform init -backend-config="bucket=${PROJECT_ID}-tfstate"
terraform plan
terraform apply
```

> ⚠️ **`firestore_location` is permanent.** A Firestore database's location can
> never be changed after creation — the only fix is deleting the database and
> losing its data. `eur3` is the Europe multi-region (`europe-west1` Belgium +
> `europe-west4` Netherlands); `nam5` is North America. GCP has no Ireland
> region — that is AWS. Be sure before you apply.

This first apply is the only one you run by hand. After it, merging a
`terraform/**` change to `main` applies automatically — see
[deployment.md](deployment.md).

Terraform will create: API enablement, the Firestore database, the Hosting
site(s), the Workload Identity Federation pool and provider, and three CI
service accounts (`github-deployer`, `github-terraform-plan`,
`github-terraform-apply`) with their IAM bindings.

At the end it prints the values you need for GitHub:

```bash
terraform output -json github_actions_config
```

---

## 7. Wire up GitHub

From the repo root, with the Terraform outputs to hand:

```bash
# Non-secret client config — these ship in the bundle anyway
gh variable set VITE_FIREBASE_API_KEY             --body "..."
gh variable set VITE_FIREBASE_AUTH_DOMAIN         --body "choreo-planner.firebaseapp.com"
gh variable set VITE_FIREBASE_PROJECT_ID          --body "choreo-planner"
gh variable set VITE_FIREBASE_STORAGE_BUCKET      --body "choreo-planner.firebasestorage.app"
gh variable set VITE_FIREBASE_MESSAGING_SENDER_ID --body "..."
gh variable set VITE_FIREBASE_APP_ID              --body "..."

# From `terraform output -json github_actions_config`
gh variable set GCP_PROJECT_ID             --body "choreo-planner"
gh variable set GCP_WIF_PROVIDER           --body "projects/123.../providers/github"
gh variable set GCP_DEPLOY_SERVICE_ACCOUNT --body "github-deployer@choreo-planner.iam.gserviceaccount.com"
gh variable set GCP_PLAN_SERVICE_ACCOUNT   --body "github-terraform-plan@choreo-planner.iam.gserviceaccount.com"
gh variable set GCP_APPLY_SERVICE_ACCOUNT  --body "github-terraform-apply@choreo-planner.iam.gserviceaccount.com"
gh variable set TF_STATE_BUCKET            --body "choreo-planner-tfstate"
```

Then create two gates under **GitHub → Settings → Environments**:

- **`production`** — add yourself as a **required reviewer**. Every production
  app deploy waits here.
- **`infrastructure`** — used by the `terraform apply` job that runs on merge.
  Leave it without reviewers if reading the plan comment on the PR is gate
  enough for you; add yourself if you want to confirm twice.

---

## 8. Verify

```bash
# Rules and indexes deploy from the CLI
firebase use "$PROJECT_ID"
firebase deploy --only firestore:rules,firestore:indexes

# Emulators for local development — no cloud writes
firebase emulators:start
```

Then open a throwaway PR. You should see: CI checks green, a bot comment with a
preview URL, and a `terraform plan` comment. Merge it and the production deploy
should wait for your approval, then publish.

---

## Checklist

- [ ] Firebase project created; project ID noted
- [ ] Blaze enabled + $1 budget alert configured
- [ ] Web app registered; config values copied to `.env.local`
- [ ] Anonymous + Google sign-in enabled; anonymous auto-delete OFF
- [ ] Terraform state bucket created with versioning
- [ ] `terraform/prod.auto.tfvars` matches your real project ID
- [ ] First `terraform apply` succeeded (run by hand; later ones run on merge)
- [ ] GitHub variables set (six `VITE_*` plus six `GCP_*`/`TF_*`)
- [ ] `production` environment created with a reviewer
- [ ] `infrastructure` environment created
- [ ] Test PR produced a preview URL; merge deployed to prod
