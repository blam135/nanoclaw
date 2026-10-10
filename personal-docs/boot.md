# Starting and stopping NanoClaw on macOS (OrbStack + OneCLI)

Run these commands in Terminal from your NanoClaw checkout. Starting and stopping the service preserves your agents, conversations, credentials, and scheduled tasks.

**Start:** Open OrbStack and wait for Docker to be ready, then start OneCLI and its database before NanoClaw:

```bash
cd ~/Documents/nanoclaw-v2
docker compose -f "$HOME/.onecli/docker-compose.yml" start --wait
bash setup/lib/restart.sh --channel discord
```

The restart command also starts an unloaded NanoClaw service and waits for it to report ready. If you use another channel, replace `discord` with its adapter instance name.

**Stop:** Unload this checkout's service so it stops responding and processing scheduled tasks:

```bash
cd ~/Documents/nanoclaw-v2
source setup/lib/install-slug.sh
launchctl unload "$HOME/Library/LaunchAgents/$(launchd_label).plist"
```

To also stop OneCLI and Postgres, run the following only if no other apps or NanoClaw installs need this shared gateway:

```bash
docker compose -f "$HOME/.onecli/docker-compose.yml" stop
```

**Check:** OneCLI and Postgres should both be healthy, and NanoClaw's log should show `NanoClaw running` and a Discord connection:

```bash
docker compose -f "$HOME/.onecli/docker-compose.yml" ps
curl -fsS http://127.0.0.1:10254/v1/health
tail -n 30 logs/nanoclaw.log
```

If startup fails, check `logs/nanoclaw.error.log`. An upgrade-state mismatch needs the validation steps in [the recovery guide](../docs/upgrade-recovery.md) before updating the startup record. If OneCLI is stopped, Discord can appear online while agents cannot respond.

