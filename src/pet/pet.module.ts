import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Pet } from "./entities/pet.entity";
import { PetFeed } from "./entities/pet-feed.entity";
import { PetService } from "./services/pet.service";
import { PetController } from "./controller/pet.controller";
import { TaskHistoryModule } from "src/task_history/task-history.module";
import { User } from "src/users/users.entity";
import { TaskHistoryService } from "src/task_history/task-history.service";
import { AuthModule } from "src/auth/auth.module";
import { AiModule } from "src/ai/ai.module";
import { PetMensajeService } from "./services/pet-mensaje.service";
import { TaskPersonal } from "src/task/Entities/task-personal.entity";
import { TaskProyect } from "src/task/Entities/task-proyect.entity";
import { TaskHistory } from "src/task_history/task-history.entity";

@Module({
    imports: [TypeOrmModule.forFeature([Pet, PetFeed, User, TaskPersonal, TaskProyect, TaskHistory]), TaskHistoryModule, AuthModule, AiModule
                ],
    controllers: [PetController],
    providers: [PetService, PetMensajeService],
    exports: [PetService],
})


export class PetModule {}
