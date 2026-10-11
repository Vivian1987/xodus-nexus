import { spawnTracked, type RunOptions } from './process.js';

export interface GameProcess {
  child: ReturnType<typeof spawnTracked>['child'];
  result: ReturnType<typeof spawnTracked>['result'];
  stop(): Promise<void>;
  forceStop(): Promise<void>;
  cleanup(): Promise<void>;
}

export async function spawnGameProcess(
  command: string,
  args: string[],
  options: RunOptions,
): Promise<GameProcess> {
  const tracked = spawnTracked(command, args, options);
  return {
    ...tracked,
    stop: async () => { tracked.child.kill('SIGINT'); },
    forceStop: async () => { tracked.child.kill('SIGTERM'); },
    cleanup: async () => undefined,
  };
}
