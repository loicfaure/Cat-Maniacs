import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CatsModule } from './cats/cats.module';

@Module({
  imports: [
    CatsModule, 
    MongooseModule.forRoot('mongodb://localhost/nest')
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
