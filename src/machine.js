import { Machine, interpret, send, sendParent } from "xstate";
import BridgeMachine from "./bridgeMachine";

const dummyMachine = {
  definition: {
    id: "dummyMachine1",
    initial: "ticker",
    states: {
      ticker: {
        onEntry: [sendParent("TEST_PARENT")],
        activities: ["beeping"],
        on: {
          TEST_CHILD: {
            actions: () => console.warn("RECEIVED TEST_CHILD EVENT")
          }
        },
        invoke: {
          machineID: "dummyMachine2"
        }
      }
    }
  },
  config: {
    activities: {
      beeping: () => {
        // Start the beeping activity
        const interval = setInterval(() => console.log("BEEP!"), 1000);

        // Return a function that stops the beeping activity
        return () => clearInterval(interval);
      }
    }
  }
};

const dummyMachine2 = {
  definition: {
    id: "dummyMachine2",
    initial: "idle",
    states: {
      idle: {
        onEntry: [() => console.info("dummyMachine2 spawned")]
        // activities: ["beeping"]
      }
    }
  },
  config: {
    activities: {
      beeping: () => {
        // Start the beeping activity
        const interval = setInterval(() => console.log("BEEP 2!"), 1000);

        // Return a function that stops the beeping activity
        return () => clearInterval(interval);
      }
    }
  }
};

const builder = BridgeMachine();
builder.inventory.set("dummyMachine1", dummyMachine);
builder.inventory.set("dummyMachine2", dummyMachine2);

const mainMachine = {
  id: "mainMachine",
  initial: "init",
  states: {
    init: {
      after: {
        1: "running"
      }
    },
    running: {
      entry: { type: "xstate.send", event: { type: "TEST_INIT" } },
      invoke: {
        machineID: "dummyMachine1"
      },
      on: {
        TEST_PARENT: {
          actions: () => console.warn("RECEIVED TEST_PARENT EVENT")
        }
      },
      after: {
        100: {
          actions: send("TEST_CHILD", { to: "dummyMachine1" })
        },
        3000: "otherActivity"
      }
    },
    otherActivity: {}
  }
};

const service = interpret(Machine(builder.analyze(mainMachine)))
  .onTransition(state => {
    console.log("state:", state);
  })
  .onEvent(event => {
    console.log("event:", event);
  })
  .onChange((context, prevContext) => {
    console.log("onChange: ", context, prevContext);
  });

builder.service = service;

export { mainMachine, dummyMachine, service };
