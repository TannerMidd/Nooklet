import process from "node:process";

const supervisorPid = Number.parseInt(process.env.NOOKLET_SUPERVISOR_PID ?? "", 10);

if (Number.isSafeInteger(supervisorPid) && supervisorPid > 0 && supervisorPid !== process.pid) {
    const timer = setInterval(() => {
        try {
            process.kill(supervisorPid, 0);
        } catch (error) {
            if (
                !error ||
                typeof error !== "object" ||
                !("code" in error) ||
                error.code !== "ESRCH"
            ) {
                return;
            }

            process.exit(0);
        }
    }, 1_000);

    timer.unref();
}
